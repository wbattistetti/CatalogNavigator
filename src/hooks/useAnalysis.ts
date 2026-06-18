import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  chunkArray,
  collectSubtreeSlots,
  findInvalidGrammarNodes,
  getGrammarTargetSlots,
  findInvalidInternalNodes,
  findInvalidMessagesNodes,
  buildDefaultStartQuestion,
  getAgentGenerationRoots,
  getInteractiveMessageSlots,
  hasAgentContent,
  hasMessagesContent,
  indexRowsBySlot,
  mergeSubtreeGrammarRows,
  mergeSubtreeMessageRows,
  mergeSubtreeRows,
  normalizeSlotPath,
  restructureSlotPath,
} from '../lib/analysisTree';
import type { LeafConfirmationInput } from '../lib/confirmAiPostProcess';
import {
  isGrammarNodeComplete,
  isGrammarsLayerReady,
  isMessagesLayerReady,
  isMessagesNodeComplete,
  isSubtreeGrammarsComplete,
  isSubtreeMessagesComplete,
  applyNluQuestionRules,
  invalidateNluAtSlots,
  mergeTaxonomyForMessageRegen,
  mergeTaxonomyWithExistingNlu,
} from '../lib/nluQuestionRules';
import { syncExplicitItemPaths, resolveItemPaths } from '../lib/itemPaths';
import {
  buildRowFieldEditUpdate,
  stampAiMessageSubtree,
  stampDeterministicMessageLayer,
  type MessageReviewField,
} from '../lib/messageReview';
import { runGenerateConfirmations } from '../lib/runGenerateConfirmations';
import {
  runGenerateTaxonomy,
  runRefineTaxonomy,
  runRegenGrammarsSubtree,
  runRegenMessagesSubtree,
  runRegenSubtree,
} from '../lib/runAnalyzeDocument';
import {
  applyDeterministicMessagesLayer,
  buildTaxonomyFromItemPaths,
  normalizeGrammarRows,
} from '../lib/analyzeAiPostProcess';
import { migrateDualGrammars } from '../lib/grammarDual';
import {
  applyCategoryGrammarsWithTokens,
  clearRowGrammars,
} from '../lib/grammarTemplate';
import { applyCategoryGrammars, findCategoriesMissingGrammar } from '../lib/categoryGrammar';
import {
  segmentAllDescriptionsFromLoadedRefs,
  segmentAllDescriptionsFromLoadedRefsAsync,
  type LoadedDictionaryRef,
} from '../lib/multiDictionarySegment';
import {
  segmentAllDescriptions,
  type TokenDictionary,
  type TokenEntry,
} from '../lib/tokenDictionary';
import {
  setTokenGrammar,
  syncRowGrammarsFromTokens,
} from '../lib/tokenGrammar';
import {
  syncTaxonomyFromLeafPaths,
  type TaxonomySyncOptions,
  type TaxonomySyncResult,
} from '../lib/taxonomyPathSync';
import { getPathOrderingCategories } from '../lib/pathCanonicalize';
import type { TokenCategory } from '../lib/dictionaryTree';
import type {
  AgentGenProgress,
  Analysis,
  AnalysisRow,
  GeneratingPhase,
  GrammarEditMode,
  GrammarEditTarget,
  GrammarEntry,
  OntologySyncPhase,
  RowStatus,
} from '../lib/analysisTypes';

export type {
  AgentGenProgress,
  Analysis,
  AnalysisRow,
  GeneratingPhase,
  GrammarEditMode,
  GrammarEditTarget,
  GrammarEntry,
  RowStatus,
} from '../lib/analysisTypes';

import type { MessageReviewField } from '../lib/analysisTypes';
import { yieldToUi } from '../lib/yieldToUi';

const MESSAGE_EDIT_FIELDS: MessageReviewField[] = [
  'question', 'no_match_1', 'no_match_2', 'no_match_3', 'confirmation_text',
];

function findDirtyRoot(deletedSlot: string, remainingRows: AnalysisRow[]): string | null {
  const parts = deletedSlot.split('.');
  for (let i = parts.length - 1; i >= 1; i--) {
    const ancestor = parts.slice(0, i).join('.');
    if (remainingRows.some((r) => r.slot_filling === ancestor)) return ancestor;
  }
  return null;
}

async function persistAnalysis(documentId: string, analysis: Analysis): Promise<Analysis> {
  await supabase.from('kb_analyses').delete().eq('document_id', documentId);
  const { data: inserted, error } = await supabase
    .from('kb_analyses')
    .insert({
      document_id: documentId,
      rows: analysis.rows,
      item_paths: analysis.item_paths ?? [],
      start_question: analysis.start_question,
      confirmation_preamble: analysis.confirmation_preamble,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return inserted as Analysis;
}

function normalizeLoadedAnalysis(data: Analysis): Analysis {
  const rawRows = data.rows.map((r) => ({
    ...r,
    answer_grammar: r.answer_grammar ?? null,
    confirmation_text: r.confirmation_text ?? null,
  }));
  const itemPaths = syncExplicitItemPaths(
    rawRows.map((r) => r.slot_filling),
    data.item_paths ?? null,
  );
  const rows = migrateDualGrammars(normalizeGrammarRows(rawRows), itemPaths, pathOrderingCategoriesRef.current);
  const slots = rows.map((r) => r.slot_filling);
  return {
    ...data,
    start_question: data.start_question ?? null,
    confirmation_preamble: data.confirmation_preamble ?? 'Quindi confermo:',
    item_paths: syncExplicitItemPaths(slots, data.item_paths ?? null),
    rows,
  };
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Generazione annullata', 'AbortError');
}

function draftAnalysis(
  documentId: string,
  rows: AnalysisRow[],
  existing?: Analysis | null,
  item_paths?: string[] | null,
): Analysis {
  const now = new Date().toISOString();
  const slots = rows.map((r) => r.slot_filling);
  const resolvedItems = item_paths !== undefined
    ? syncExplicitItemPaths(slots, item_paths)
    : syncExplicitItemPaths(slots, existing?.item_paths ?? null);
  return {
    id: existing?.id ?? '',
    document_id: documentId,
    rows,
    item_paths: resolvedItems,
    start_question: existing?.start_question ?? null,
    confirmation_preamble: existing?.confirmation_preamble ?? 'Quindi confermo:',
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
}

/** Fills start_question from forest roots when missing (global opening, not a tree node). */
function applyStartQuestionIfMissing(analysis: Analysis): Analysis {
  if (analysis.start_question?.trim()) return analysis;
  const slots = analysis.rows.map((r) => r.slot_filling);
  return {
    ...analysis,
    start_question: buildDefaultStartQuestion(slots),
  };
}

function draftWithStart(documentId: string, rows: AnalysisRow[], existing?: Analysis | null): Analysis {
  return applyStartQuestionIfMissing(draftAnalysis(documentId, rows, existing));
}

export function useAnalysis(documentId: string) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analysisDirty, setAnalysisDirty] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingPhase, setGeneratingPhase] = useState<GeneratingPhase>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirtyRoots, setDirtyRoots] = useState<string[]>([]);
  const [regeningRoots, setRegeningRoots] = useState<string[]>([]);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [agentGenProgress, setAgentGenProgress] = useState<AgentGenProgress | null>(null);
  const [generatingConfirmations, setGeneratingConfirmations] = useState(false);
  const generationAbortRef = useRef<AbortController | null>(null);
  const grammarTokensRef = useRef<TokenEntry[]>([]);
  const [grammarTokensBound, setGrammarTokensBound] = useState<TokenEntry[]>([]);
  const pathOrderingCategoriesRef = useRef<TokenCategory[]>([]);

  const bindPathOrderingCategories = useCallback((categories: TokenCategory[]) => {
    pathOrderingCategoriesRef.current = categories;
  }, []);

  const resolvePathOrderingCategories = useCallback((): TokenCategory[] => {
    return pathOrderingCategoriesRef.current;
  }, []);

  const beginGenerationAbort = useCallback((): AbortSignal => {
    generationAbortRef.current?.abort();
    const controller = new AbortController();
    generationAbortRef.current = controller;
    return controller.signal;
  }, []);

  const clearGenerationAbort = useCallback(() => {
    generationAbortRef.current = null;
  }, []);

  const cancelGeneration = useCallback(() => {
    generationAbortRef.current?.abort();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('kb_analyses')
        .select('*')
        .eq('document_id', documentId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (err) {
        setError(err.message);
        return;
      }
      setError(null);
      const loaded = data ? normalizeLoadedAnalysis(data as Analysis) : null;
      setAnalysis((prev) => {
        if (loaded?.rows.length) return loaded;
        if (prev?.rows.length && prev.document_id === documentId) return prev;
        return loaded;
      });
      setAnalysisDirty(false);
      setDirtyRoots([]);
      setSyncNotice(null);
    } finally {
      setLoading(false);
      setInitialLoadDone(true);
    }
  }, [documentId]);

  useEffect(() => {
    setAnalysis(null);
    setInitialLoadDone(false);
    setLoading(true);
  }, [documentId]);

  const saveAnalysis = useCallback(async () => {
    if (!analysis || analysis.rows.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const persisted = await persistAnalysis(documentId, analysis);
      setAnalysis(normalizeLoadedAnalysis(persisted));
      setAnalysisDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setSaving(false);
    }
  }, [analysis, documentId]);

  const discardAnalysisChanges = useCallback(async () => {
    await load();
  }, [load]);

  const updateAgentConfig = useCallback((updates: {
    start_question?: string | null;
    confirmation_preamble?: string | null;
  }) => {
    if (!analysis) return;
    setAnalysis({ ...analysis, ...updates });
    setAnalysisDirty(true);
  }, [analysis]);

  /** Generates discursive confirmation_text for leaf rows (separate IA pass from NLU). */
  const generateConfirmations = useCallback(async (
    leafDescriptions?: Map<string, string> | null,
  ) => {
    if (!analysis) return;
    const slots = analysis.rows.map((r) => r.slot_filling);
    const itemPaths = resolveItemPaths(slots, analysis.item_paths);
    if (itemPaths.length === 0) throw new Error('Nessun item corpus nell\'albero');

    const items: LeafConfirmationInput[] = itemPaths.map((slot) => ({
      slot_filling: slot,
      description: leafDescriptions?.get(slot)?.trim()
        || slot.replace(/\./g, ' ').replace(/_/g, ' '),
    }));

    setGeneratingConfirmations(true);
    setError(null);
    try {
      const confirmations = await runGenerateConfirmations(items);
      const newRows = analysis.rows.map((row) => {
        const text = confirmations.get(row.slot_filling);
        if (!text) return row;
        return { ...row, confirmation_text: text };
      });
      setAnalysis({ ...analysis, rows: newRows });
      setAnalysisDirty(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setGeneratingConfirmations(false);
    }
  }, [analysis]);

  /** Generates messages per forest root, merging incrementally into rows. */
  const generateMessagesByRootChunks = useCallback(async (
    taxonomyRows: AnalysisRow[],
    documentName: string,
    documentText: string,
    existing: Analysis | null,
    signal?: AbortSignal,
    options?: { forceAiReview?: boolean },
  ): Promise<AnalysisRow[]> => {
    const allSlots = taxonomyRows.map((r) => r.slot_filling);
    const roots = getAgentGenerationRoots(allSlots);
    if (roots.length === 0) throw new Error('Nessuna radice nell\'albero');

    const itemPaths = existing?.item_paths ?? null;
    const categories = pathOrderingCategoriesRef.current;
    setAgentGenProgress({ current: 0, total: roots.length, rootSlot: 'preparazione' });
    await yieldToUi();

    let currentRows = applyDeterministicMessagesLayer(taxonomyRows, itemPaths, categories);
    await yieldToUi();
    const allSlotsAfterDet = currentRows.map((r) => r.slot_filling);
    currentRows = applyNluQuestionRules(allSlotsAfterDet, currentRows, itemPaths, categories);
    await yieldToUi();
    currentRows = stampDeterministicMessageLayer(currentRows, itemPaths, categories);
    setAnalysis(draftWithStart(documentId, currentRows, existing));
    setAnalysisDirty(true);
    await yieldToUi();

    const isComplete = (slot: string, row: AnalysisRow) =>
      isMessagesNodeComplete(allSlots, slot, row, itemPaths, categories);
    const forceAiReview = options?.forceAiReview ?? false;

    for (let i = 0; i < roots.length; i++) {
      throwIfAborted(signal);
      const rootSlot = roots[i]!;
      setAgentGenProgress({ current: i + 1, total: roots.length, rootSlot });

      const subtreeSlots = collectSubtreeSlots(currentRows, rootSlot);
      const interactiveSlots = getInteractiveMessageSlots(subtreeSlots, itemPaths, categories);

      if (
        interactiveSlots.length === 0
        || (!forceAiReview && isSubtreeMessagesComplete(currentRows, rootSlot, itemPaths, categories))
      ) {
        setRegeningRoots([]);
        setAnalysis(draftWithStart(documentId, currentRows, existing));
        continue;
      }

      setRegeningRoots([rootSlot]);

      const regenRows = await runRegenMessagesSubtree(
        subtreeSlots,
        rootSlot,
        documentName,
        documentText,
        signal,
        itemPaths,
        categories,
      );

      throwIfAborted(signal);

      const invalid = findInvalidMessagesNodes(subtreeSlots, regenRows, itemPaths, categories);
      if (invalid.length > 0) {
        throw new Error(`Messaggi mancanti per ${rootSlot}: ${invalid.join(', ')}`);
      }

      const regenedBySlot = indexRowsBySlot(regenRows);
      currentRows = mergeSubtreeMessageRows(currentRows, regenedBySlot, rootSlot, false, isComplete);
      currentRows = applyNluQuestionRules(
        currentRows.map((r) => r.slot_filling),
        currentRows,
        itemPaths,
        categories,
      );
      currentRows = stampAiMessageSubtree(currentRows, rootSlot, itemPaths, categories);
      setAnalysis(draftWithStart(documentId, currentRows, existing));
    }

    const finalSlots = currentRows.map((r) => r.slot_filling);
    currentRows = applyNluQuestionRules(finalSlots, currentRows, itemPaths, categories);
    return currentRows;
  }, [documentId]);

  /** Generates grammars per forest root — incremental by default, optional full overwrite. */
  const generateGrammarsByRootChunks = useCallback(async (
    baseRows: AnalysisRow[],
    documentName: string,
    documentText: string,
    existing: Analysis | null,
    overwriteExisting: boolean,
    signal?: AbortSignal,
  ): Promise<AnalysisRow[]> => {
    const allSlots = baseRows.map((r) => r.slot_filling);
    const roots = getAgentGenerationRoots(allSlots);
    if (roots.length === 0) throw new Error('Nessuna radice nell\'albero');

    let currentRows = baseRows;
    const categories = pathOrderingCategoriesRef.current;
    setAnalysis(draftAnalysis(documentId, currentRows, existing));
    setAnalysisDirty(true);

    const isComplete = (slot: string, row: AnalysisRow) =>
      isGrammarNodeComplete(allSlots, slot, row);

    for (let i = 0; i < roots.length; i++) {
      throwIfAborted(signal);
      const rootSlot = roots[i]!;
      const subtreeSlots = collectSubtreeSlots(currentRows, rootSlot);
      const targetSlots = getGrammarTargetSlots(
        subtreeSlots, currentRows, overwriteExisting, existing?.item_paths, categories,
      );

      setAgentGenProgress({ current: i + 1, total: roots.length, rootSlot });

      if (targetSlots.length === 0) {
        setRegeningRoots([]);
        setAnalysis(draftAnalysis(documentId, currentRows, existing));
        continue;
      }

      setRegeningRoots([rootSlot]);

      const GRAMMAR_BATCH_SIZE = 30;
      const batches = chunkArray(targetSlots, GRAMMAR_BATCH_SIZE);
      const regenedBySlot = new Map<string, AnalysisRow>();

      for (const batch of batches) {
        throwIfAborted(signal);
        await runRegenGrammarsSubtree(
          batch,
          rootSlot,
          currentRows,
          documentName,
          documentText,
          !overwriteExisting,
          signal,
        );

        const { rows: clearedRows, categories: nextCategories } = applyCategoryGrammarsWithTokens(
          currentRows,
          grammarTokensRef.current,
          overwriteExisting,
          existing?.item_paths,
          categories,
        );
        currentRows = clearedRows;
        pathOrderingCategoriesRef.current = nextCategories;

        const invalid = findInvalidGrammarNodes(batch, currentRows, existing?.item_paths, nextCategories);
        if (invalid.length > 0) {
          throw new Error(`Grammatiche mancanti per ${rootSlot}: ${invalid.join(', ')}`);
        }

        for (const slot of batch) {
          const row = currentRows.find((r) => r.slot_filling === slot);
          if (row) regenedBySlot.set(slot, row);
        }
      }
      currentRows = mergeSubtreeGrammarRows(
        currentRows,
        regenedBySlot,
        rootSlot,
        !overwriteExisting,
        isComplete,
      );
      setAnalysis(draftAnalysis(documentId, currentRows, existing));
    }

    const { rows: finalRows, categories: finalCategories } = applyCategoryGrammarsWithTokens(
      currentRows,
      grammarTokensRef.current,
      false,
      existing?.item_paths ?? null,
      categories,
    );
    pathOrderingCategoriesRef.current = finalCategories;
    return finalRows;
  }, [documentId]);

  /**
   * Builds tree from dictionary segmentation (deterministic only).
   * NLU / IA disattivata temporaneamente — usare generateAgent in Slot Filling dopo.
   */
  const applyTaxonomySyncResult = useCallback((
    result: TaxonomySyncResult,
    existing?: Analysis | null,
  ) => {
    if (result.pathsUnchanged) {
      setSyncNotice('Ontologia aggiornata — path invariati rispetto al corpus corrente.');
      return;
    }
    setAnalysis(draftAnalysis(documentId, result.rows, existing ?? null, result.item_paths));
    setAnalysisDirty(true);
    setDirtyRoots((prev) => {
      const next = [...prev];
      for (const root of result.dirtyRoots) {
        if (!next.includes(root)) next.push(root);
      }
      return next;
    });
    const parts: string[] = [];
    if (result.summary.addedItemPaths > 0) parts.push(`+${result.summary.addedItemPaths} item`);
    if (result.summary.removedItemPaths > 0) parts.push(`-${result.summary.removedItemPaths} item`);
    if (result.dirtyRoots.length > 0) parts.push(`${result.dirtyRoots.length} rami da rigenerare`);
    setSyncNotice(parts.length > 0 ? `Albero aggiornato: ${parts.join(', ')}` : 'Albero aggiornato');
  }, [documentId]);

  const applyLeafPathSync = useCallback((
    leafPaths: string[],
    syncOptions?: TaxonomySyncOptions,
  ): TaxonomySyncResult | null => {
    if (leafPaths.length === 0) {
      setSyncNotice(null);
      return null;
    }
    if (syncOptions?.loadedRefs?.length) {
      pathOrderingCategoriesRef.current = getPathOrderingCategories(syncOptions.loadedRefs);
    } else if (syncOptions?.categories?.length) {
      pathOrderingCategoriesRef.current = syncOptions.categories;
    }
    const result = syncTaxonomyFromLeafPaths(
      leafPaths,
      analysis?.rows,
      analysis?.item_paths,
      syncOptions,
    );
    applyTaxonomySyncResult(result, analysis);
    return result;
  }, [analysis, applyTaxonomySyncResult]);

  /** Structural tree sync from dictionary segmentation; preserves unchanged NLU. */
  const syncTaxonomyFromDictionary = useCallback((
    dictionary: TokenDictionary,
    descriptions: string[],
  ): TaxonomySyncResult | null => {
    setError(null);
    try {
      const { leafPaths } = segmentAllDescriptions(
        descriptions,
        dictionary.tokens,
        dictionary.categories ?? [],
      );
      return applyLeafPathSync(leafPaths, { categories: dictionary.categories ?? [] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }, [applyLeafPathSync]);

  /** Rebuilds ontology paths from multi-dictionary corpus segmentation (live category order). */
  const syncTaxonomyFromLoadedRefs = useCallback((
    descriptions: string[],
    loadedRefs: LoadedDictionaryRef[],
  ): TaxonomySyncResult | null => {
    setError(null);
    try {
      const { leafPaths } = segmentAllDescriptionsFromLoadedRefs(descriptions, loadedRefs);
      return applyLeafPathSync(leafPaths, { loadedRefs });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }, [applyLeafPathSync]);

  /** Async variant: batched segmentation with progress and cancel (for Ricrea ontologia). */
  const syncTaxonomyFromLoadedRefsAsync = useCallback(async (
    descriptions: string[],
    loadedRefs: LoadedDictionaryRef[],
    options?: {
      onProgress?: (current: number, total: number) => void;
      onPhase?: (phase: OntologySyncPhase) => void;
      shouldCancel?: () => boolean;
    },
  ): Promise<{ result: TaxonomySyncResult | null; cancelled: boolean }> => {
    setError(null);
    try {
      options?.onPhase?.('segmentation');
      const { leafPaths, cancelled } = await segmentAllDescriptionsFromLoadedRefsAsync(
        descriptions,
        loadedRefs,
        {
          yieldEvery: 50,
          onProgress: options?.onProgress,
          shouldCancel: options?.shouldCancel,
        },
      );
      if (cancelled) return { result: null, cancelled: true };
      if (leafPaths.length === 0) {
        throw new Error('Nessuna descrizione segmentata con il dizionario corrente');
      }
      options?.onPhase?.('building');
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const result = applyLeafPathSync(leafPaths, { loadedRefs });
      return { result, cancelled: false };
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }, [applyLeafPathSync]);

  const clearSyncNotice = useCallback(() => setSyncNotice(null), []);

  const createAgentFromDictionary = useCallback((
    dictionary: TokenDictionary,
    descriptions: string[],
    _documentName: string,
    _documentText?: string,
  ) => {
    const { leafPaths } = segmentAllDescriptions(
      descriptions,
      dictionary.tokens,
      dictionary.categories ?? [],
    );
    if (leafPaths.length === 0) {
      const msg = 'Nessuna descrizione segmentata con il dizionario corrente';
      setError(msg);
      throw new Error(msg);
    }

    let outcome: 'existing' | 'mounted' | 'failed' = 'failed';
    let nextDirtyRoots: string[] = [];

    setAnalysis((current) => {
      if ((current?.rows.length ?? 0) > 0) {
        outcome = 'existing';
        return current;
      }
      const result = syncTaxonomyFromLeafPaths(
        leafPaths,
        null,
        null,
        { categories: dictionary.categories ?? [] },
      );
      if (result.rows.length === 0) return current;
      outcome = 'mounted';
      nextDirtyRoots = result.dirtyRoots;
      return draftAnalysis(documentId, result.rows, current, result.item_paths);
    });

    if (outcome === 'existing' || outcome === 'mounted') {
      setError(null);
      if (outcome === 'mounted') {
        setDirtyRoots(nextDirtyRoots);
        setAnalysisDirty(true);
      }
      return;
    }

    const msg = 'Impossibile costruire l\'albero dal dizionario';
    setError(msg);
    throw new Error(msg);
  }, [documentId]);

  /**
   * Syncs ontology from live loaded dictionaries (same path as Ricrea ontologia),
   * then generates IA messages without reverting category order.
   */
  const generateMessagesFromDictionary = useCallback(async (
    descriptions: string[],
    loadedRefs: LoadedDictionaryRef[],
    documentName: string,
    documentText?: string,
  ) => {
    const signal = beginGenerationAbort();
    setGenerating(true);
    setGeneratingPhase('taxonomy');
    setError(null);
    try {
      throwIfAborted(signal);
      const { leafPaths } = segmentAllDescriptionsFromLoadedRefs(descriptions, loadedRefs);
      if (leafPaths.length === 0) {
        throw new Error('Nessuna descrizione segmentata con il dizionario corrente');
      }
      const syncResult = syncTaxonomyFromLeafPaths(
        leafPaths,
        analysis?.rows,
        analysis?.item_paths,
        { loadedRefs },
      );
      const taxonomyRows = mergeTaxonomyForMessageRegen(syncResult.rows, analysis?.rows);
      const draft = draftAnalysis(documentId, taxonomyRows, analysis, syncResult.item_paths);
      setAnalysis(draft);
      setAnalysisDirty(true);
      if (!syncResult.pathsUnchanged) {
        setDirtyRoots((prev) => {
          const next = [...prev];
          for (const root of syncResult.dirtyRoots) {
            if (!next.includes(root)) next.push(root);
          }
          return next;
        });
      }
      setGeneratingPhase('messages');
      const finalRows = await generateMessagesByRootChunks(
        taxonomyRows,
        documentName,
        documentText ?? '',
        draft,
        signal,
      );
      setAnalysis(draftWithStart(documentId, finalRows, draft));
      setDirtyRoots([]);
    } catch (e) {
      if (!isAbortError(e)) setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setRegeningRoots([]);
      setAgentGenProgress(null);
      setGenerating(false);
      setGeneratingPhase(null);
      clearGenerationAbort();
    }
  }, [documentId, analysis, generateMessagesByRootChunks, beginGenerationAbort, clearGenerationAbort]);

  /** IA taxonomy from plain text, then messages. */
  const generateMessagesFromText = useCallback(async (documentText: string, documentName: string) => {
    const signal = beginGenerationAbort();
    setGenerating(true);
    setGeneratingPhase('taxonomy');
    setError(null);
    try {
      throwIfAborted(signal);
      const taxonomy = await runGenerateTaxonomy(documentText, documentName, signal);
      const draft = draftAnalysis(documentId, taxonomy.rows, analysis, taxonomy.item_paths);
      setAnalysis(draft);
      setGeneratingPhase('messages');
      await generateMessagesByRootChunks(taxonomy.rows, documentName, documentText, draft, signal);
      setDirtyRoots([]);
    } catch (e) {
      if (!isAbortError(e)) setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setRegeningRoots([]);
      setAgentGenProgress(null);
      setGenerating(false);
      setGeneratingPhase(null);
      clearGenerationAbort();
    }
  }, [generateMessagesByRootChunks, beginGenerationAbort, clearGenerationAbort]);

  /** Syncs row.grammar views from canonical token grammars in the dictionary. */
  const syncGrammarsFromTokens = useCallback((tokens: TokenEntry[]) => {
    if (!analysis) return tokens;
    const newRows = syncRowGrammarsFromTokens(analysis.rows, tokens);
    const changed = newRows.some((row, index) => row.grammar !== analysis.rows[index]?.grammar);
    if (!changed) return tokens;
    setAnalysis({ ...analysis, rows: newRows });
    setAnalysisDirty(true);
    return tokens;
  }, [analysis]);

  /** Updates one token grammar and refreshes all rows that share that token. */
  const updateTokenGrammar = useCallback((tokenText: string, grammar: GrammarEntry) => {
    if (!analysis) return;
    const dictTokens = grammarTokensRef.current;
    const nextTokens = setTokenGrammar(dictTokens, tokenText, grammar);
    grammarTokensRef.current = nextTokens;
    setGrammarTokensBound(nextTokens);
    const newRows = syncRowGrammarsFromTokens(analysis.rows, nextTokens);
    setAnalysis({ ...analysis, rows: newRows });
    setAnalysisDirty(true);
    return nextTokens;
  }, [analysis]);

  const bindGrammarTokens = useCallback((tokens: TokenEntry[]) => {
    grammarTokensRef.current = tokens;
    setGrammarTokensBound(tokens);
  }, []);

  /** Generates category grammars (rule-based) and clears legacy node grammars. */
  const generateGrammars = useCallback(async (
    tokens: TokenEntry[],
    _documentText: string,
    _documentName: string,
    overwriteExisting = false,
  ): Promise<{ tokens: TokenEntry[]; categories: TokenCategory[] } | undefined> => {
    if (!analysis) {
      throw new Error('Nessuna analisi caricata');
    }
    if (analysis.rows.length === 0) {
      throw new Error('Genera prima la tassonomia');
    }
    const categories = pathOrderingCategoriesRef.current;
    if (!overwriteExisting) {
      const missing = findCategoriesMissingGrammar(categories);
      if (missing.length === 0) {
        setError(null);
        return { tokens, categories };
      }
    }

    setGenerating(true);
    setGeneratingPhase('grammars');
    setAgentGenProgress({ current: 0, total: categories.length, rootSlot: 'preparazione' });
    setError(null);

    try {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const { rows: newRows, tokens: nextTokens, categories: nextCategories } =
        applyCategoryGrammarsWithTokens(
          analysis.rows,
          tokens,
          overwriteExisting,
          analysis.item_paths,
          categories,
        );
      pathOrderingCategoriesRef.current = nextCategories;
      grammarTokensRef.current = nextTokens;
      setGrammarTokensBound(nextTokens);
      setAgentGenProgress({
        current: nextCategories.length,
        total: nextCategories.length,
        rootSlot: 'completato',
      });
      setAnalysis(applyStartQuestionIfMissing({ ...analysis, rows: newRows }));
      setAnalysisDirty(true);
      setDirtyRoots([]);
      await new Promise((resolve) => setTimeout(resolve, 400));
      return { tokens: nextTokens, categories: nextCategories };
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setGenerating(false);
      setGeneratingPhase(null);
      setAgentGenProgress(null);
    }
  }, [analysis]);

  /** Compiles category grammars from dictionary data (no taxonomy required). */
  const generateDictionaryCategoryGrammars = useCallback(async (
    tokens: TokenEntry[],
    categories: TokenCategory[],
    overwriteExisting = false,
  ): Promise<TokenCategory[]> => {
    if (!overwriteExisting && findCategoriesMissingGrammar(categories).length === 0) {
      return categories;
    }

    setGenerating(true);
    setGeneratingPhase('grammars');
    setError(null);

    try {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const nextCategories = applyCategoryGrammars(categories, tokens, overwriteExisting);
      grammarTokensRef.current = tokens;
      setGrammarTokensBound(tokens);
      if (analysis?.rows.length) {
        setAnalysis(applyStartQuestionIfMissing({
          ...analysis,
          rows: clearRowGrammars(analysis.rows),
        }));
        setAnalysisDirty(true);
      }
      return nextCategories;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setGenerating(false);
      setGeneratingPhase(null);
    }
  }, [analysis]);

  /** Generates grammars via OpenAI (slow — use for refinement only). */
  const generateGrammarsWithAi = useCallback(async (
    documentText: string,
    documentName: string,
    overwriteExisting = false,
  ) => {
    if (!analysis) return;
    if (analysis.rows.length === 0) {
      throw new Error('Genera prima la tassonomia');
    }
    const allSlots = analysis.rows.map((r) => r.slot_filling);
    if (!overwriteExisting) {
      const missing = findInvalidGrammarNodes(
        allSlots, analysis.rows, analysis.item_paths, pathOrderingCategoriesRef.current,
      );
      if (missing.length === 0) {
        setError(null);
        return;
      }
    }
    const signal = beginGenerationAbort();
    setGenerating(true);
    setGeneratingPhase('grammars');
    setError(null);
    try {
      await generateGrammarsByRootChunks(
        analysis.rows,
        documentName,
        documentText,
        analysis,
        overwriteExisting,
        signal,
      );
      setDirtyRoots([]);
    } catch (e) {
      if (!isAbortError(e)) setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setRegeningRoots([]);
      setAgentGenProgress(null);
      setGenerating(false);
      setGeneratingPhase(null);
      clearGenerationAbort();
    }
  }, [analysis, generateGrammarsByRootChunks, beginGenerationAbort, clearGenerationAbort]);

  /** Regenerates grammars for a subtree (incremental by default). */
  const regenGrammarsSubtree = useCallback(async (
    rootSlot: string,
    documentText: string,
    documentName: string,
    overwriteExisting = false,
  ) => {
    if (!analysis) return;
    setRegeningRoots((prev) => [...prev, rootSlot]);
    setRegenError(null);
    try {
      const subtreeSlots = collectSubtreeSlots(analysis.rows, rootSlot);
      if (subtreeSlots.length === 0) throw new Error('Nessuno slot nel sottoalbero');

      const categories = pathOrderingCategoriesRef.current;
      const targetSlots = getGrammarTargetSlots(
        subtreeSlots, analysis.rows, overwriteExisting, analysis.item_paths, categories,
      );
      if (targetSlots.length === 0) return;

      const { rows: newRows, categories: nextCategories } = applyCategoryGrammarsWithTokens(
        analysis.rows,
        grammarTokensRef.current,
        overwriteExisting,
        analysis.item_paths,
        categories,
      );
      pathOrderingCategoriesRef.current = nextCategories;

      setAnalysis({ ...analysis, rows: newRows });
      setAnalysisDirty(true);
    } catch (e) {
      setRegenError(e instanceof Error ? e.message : String(e));
    } finally {
      setRegeningRoots((prev) => prev.filter((r) => r !== rootSlot));
    }
  }, [analysis]);

  const generateTaxonomy = useCallback(async (documentText: string, documentName: string) => {
    setGenerating(true);
    setGeneratingPhase('taxonomy');
    setError(null);
    try {
      const taxonomy = await runGenerateTaxonomy(documentText, documentName);
      setAnalysis((prev) => draftAnalysis(documentId, taxonomy.rows, prev, taxonomy.item_paths));
      setAnalysisDirty(true);
      setDirtyRoots([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
      setGeneratingPhase(null);
    }
  }, [documentId]);

  const generateAgent = useCallback(async (documentText: string, documentName: string) => {
    if (!analysis) return;
    const signal = beginGenerationAbort();
    setGenerating(true);
    setGeneratingPhase('messages');
    setError(null);
    try {
      await generateMessagesByRootChunks(analysis.rows, documentName, documentText, analysis, signal);
      setDirtyRoots([]);
    } catch (e) {
      if (!isAbortError(e)) setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRegeningRoots([]);
      setAgentGenProgress(null);
      setGenerating(false);
      setGeneratingPhase(null);
      clearGenerationAbort();
    }
  }, [analysis, generateMessagesByRootChunks, beginGenerationAbort, clearGenerationAbort]);

  /** IA messages only — tree must already exist (deterministic mount). */
  const generateMessagesOnly = useCallback(async (documentName: string, documentText?: string) => {
    if (!analysis?.rows.length) {
      throw new Error('Albero non presente — monta prima la tassonomia');
    }
    const signal = beginGenerationAbort();
    setGenerating(true);
    setGeneratingPhase('messages');
    setError(null);
    setAgentGenProgress({ current: 0, total: 1, rootSlot: 'preparazione' });
    await yieldToUi();
    try {
      throwIfAborted(signal);
      await generateMessagesByRootChunks(
        analysis.rows,
        documentName,
        documentText ?? '',
        analysis,
        signal,
      );
      setAnalysisDirty(true);
      setDirtyRoots([]);
    } catch (e) {
      if (!isAbortError(e)) setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setRegeningRoots([]);
      setAgentGenProgress(null);
      setGenerating(false);
      setGeneratingPhase(null);
      clearGenerationAbort();
    }
  }, [analysis, generateMessagesByRootChunks, beginGenerationAbort, clearGenerationAbort]);

  /** Re-runs IA message review on every forest root (resets field validation). */
  const reviewMessagesWithAi = useCallback(async (documentName: string, documentText?: string) => {
    if (!analysis?.rows.length) {
      throw new Error('Albero non presente — monta prima la tassonomia');
    }
    const signal = beginGenerationAbort();
    setGenerating(true);
    setGeneratingPhase('messages');
    setError(null);
    try {
      throwIfAborted(signal);
      await generateMessagesByRootChunks(
        analysis.rows,
        documentName,
        documentText ?? '',
        analysis,
        signal,
        { forceAiReview: true },
      );
      setAnalysisDirty(true);
      setDirtyRoots([]);
    } catch (e) {
      if (!isAbortError(e)) setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setRegeningRoots([]);
      setAgentGenProgress(null);
      setGenerating(false);
      setGeneratingPhase(null);
      clearGenerationAbort();
    }
  }, [analysis, generateMessagesByRootChunks, beginGenerationAbort, clearGenerationAbort]);

  const refineTaxonomy = useCallback(async (refinementNotes: string) => {
    if (!analysis) return;
    setGenerating(true);
    setGeneratingPhase('taxonomy');
    setError(null);
    try {
      const existingSlots = analysis.rows.map((r) => r.slot_filling);
      const taxonomy = await runRefineTaxonomy(existingSlots, refinementNotes);
      setAnalysis((prev) => draftAnalysis(documentId, taxonomy.rows, prev, taxonomy.item_paths));
      setAnalysisDirty(true);
      setDirtyRoots([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
      setGeneratingPhase(null);
    }
  }, [analysis, documentId]);

  const updateRow = useCallback(async (rowIndex: number, updates: Partial<AnalysisRow>) => {
    if (!analysis) return;
    const row = analysis.rows[rowIndex];
    if (!row) return;
    let working = row;
    let merged: Partial<AnalysisRow> = { ...updates };
    for (const field of MESSAGE_EDIT_FIELDS) {
      if (field in updates) {
        const patch = buildRowFieldEditUpdate(working, field, (updates[field] ?? null) as string | null);
        working = { ...working, ...patch };
        merged = { ...merged, ...patch };
      }
    }
    const newRows = analysis.rows.map((r, i) => i === rowIndex ? { ...r, ...merged } : r);
    if ('question' in updates) {
      const slot = analysis.rows[rowIndex]?.slot_filling;
      if (slot) setDirtyRoots((prev) => prev.includes(slot) ? prev : [...prev, slot]);
    }
    setAnalysis({ ...analysis, rows: newRows });
    setAnalysisDirty(true);
  }, [analysis]);

  const deleteRow = useCallback(async (rowIndex: number) => {
    if (!analysis) return;
    const slot = analysis.rows[rowIndex]?.slot_filling;
    if (!slot) return;
    let newRows = analysis.rows.filter(
      (r) => r.slot_filling !== slot && !r.slot_filling.startsWith(slot + '.'),
    );
    const dirty = findDirtyRoot(slot, newRows);
    if (dirty) {
      newRows = invalidateNluAtSlots(newRows, [dirty]);
      setDirtyRoots((prev) => (prev.includes(dirty) ? prev : [...prev, dirty]));
    }
    const slots = newRows.map((r) => r.slot_filling);
    const nextItems = (analysis.item_paths ?? []).filter(
      (p) => p !== slot && !p.startsWith(`${slot}.`),
    );
    setAnalysis({
      ...analysis,
      rows: newRows,
      item_paths: syncExplicitItemPaths(slots, nextItems),
    });
    setAnalysisDirty(true);
  }, [analysis]);

  const regenSubtree = useCallback(async (rootSlot: string, documentText: string, documentName: string) => {
    if (!analysis) return;
    setRegeningRoots((prev) => [...prev, rootSlot]);
    setRegenError(null);
    try {
      const slots = collectSubtreeSlots(analysis.rows, rootSlot);
      if (slots.length === 0) throw new Error('Nessuno slot nel sottoalbero da rigenerare');

      const regenRows = await runRegenSubtree(
        slots, rootSlot, documentName, documentText, undefined, analysis.item_paths,
      );

      if (regenRows.length === 0) {
        throw new Error('La rigenerazione non ha restituito righe valide');
      }

      const categories = pathOrderingCategoriesRef.current;
      const invalid = findInvalidInternalNodes(slots, regenRows, analysis.item_paths, categories);
      if (invalid.length > 0) {
        throw new Error(`Domande mancanti per: ${invalid.join(', ')}`);
      }

      const regenedBySlot = indexRowsBySlot(regenRows);
      let newRows = mergeSubtreeRows(analysis.rows, regenedBySlot, rootSlot);
      newRows = applyNluQuestionRules(slots, newRows, analysis.item_paths, categories);

      setAnalysis({ ...analysis, rows: newRows });
      setAnalysisDirty(true);
      setDirtyRoots((prev) => prev.filter((r) => r !== rootSlot));
    } catch (e) {
      setRegenError(e instanceof Error ? e.message : String(e));
    } finally {
      setRegeningRoots((prev) => prev.filter((r) => r !== rootSlot));
    }
  }, [analysis]);

  const addRow = useCallback(async (newSlot: string) => {
    if (!analysis) return;
    const newRow: AnalysisRow = {
      slot_filling: newSlot,
      question: null, grammar: null, answer_grammar: null,
      no_match_1: null, no_match_2: null, no_match_3: null,
      confirmation_text: null,
      status: null,
    };
    const parentSlot = newSlot.split('.').slice(0, -1).join('.');
    let newRows = [...analysis.rows];
    let insertAfterIdx = -1;
    for (let i = 0; i < newRows.length; i++) {
      const r = newRows[i]!;
      if (r.slot_filling === parentSlot || r.slot_filling.startsWith(parentSlot + '.')) {
        insertAfterIdx = i;
      }
    }
    if (insertAfterIdx >= 0) {
      newRows.splice(insertAfterIdx + 1, 0, newRow);
    } else {
      newRows.push(newRow);
    }
    if (parentSlot) {
      newRows = invalidateNluAtSlots(newRows, [parentSlot]);
      setDirtyRoots((prev) => prev.includes(parentSlot) ? prev : [...prev, parentSlot]);
    }
    const slots = newRows.map((r) => r.slot_filling);
    setAnalysis({
      ...analysis,
      rows: newRows,
      item_paths: syncExplicitItemPaths(slots, analysis.item_paths),
    });
    setAnalysisDirty(true);
  }, [analysis]);

  const restructurePath = useCallback(async (rowIndex: number, newPathRaw: string) => {
    if (!analysis) return;
    const oldSlot = analysis.rows[rowIndex]?.slot_filling;
    if (!oldSlot) return;
    try {
      const newSlot = normalizeSlotPath(newPathRaw);
      if (newSlot === oldSlot) return;

      const parentNew = newSlot.split('.').slice(0, -1).join('.');
      const parentOld = oldSlot.split('.').slice(0, -1).join('.');
      const parentsToInvalidate = [parentNew, parentOld].filter((p) => p.length > 0);
      let newRows = restructureSlotPath(analysis.rows, oldSlot, newPathRaw);
      newRows = invalidateNluAtSlots(newRows, parentsToInvalidate);

      setDirtyRoots((prev) => {
        let next = prev.map((s) => {
          if (s === oldSlot) return newSlot;
          if (s.startsWith(`${oldSlot}.`)) return newSlot + s.slice(oldSlot.length);
          return s;
        });
        for (const parent of [parentNew, parentOld]) {
          if (parent && !next.includes(parent)) next = [...next, parent];
        }
        return next;
      });

      const slots = newRows.map((r) => r.slot_filling);
      const remappedItems = (analysis.item_paths ?? []).map((p) => {
        if (p === oldSlot) return newSlot;
        if (p.startsWith(`${oldSlot}.`)) return newSlot + p.slice(oldSlot.length);
        return p;
      });
      setAnalysis({
        ...analysis,
        rows: newRows,
        item_paths: syncExplicitItemPaths(slots, remappedItems),
      });
      setAnalysisDirty(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [analysis]);

  /** Regenerates messages then grammars for a dirty subtree in one pass. */
  const regenSubtreeFull = useCallback(async (
    rootSlot: string,
    documentText: string,
    documentName: string,
    overwriteGrammars = false,
  ) => {
    if (!analysis) return;
    setRegeningRoots((prev) => [...prev, rootSlot]);
    setRegenError(null);
    try {
      const slots = collectSubtreeSlots(analysis.rows, rootSlot);
      if (slots.length === 0) throw new Error('Nessuno slot nel sottoalbero da rigenerare');

      const regenRows = await runRegenSubtree(
        slots, rootSlot, documentName, documentText, undefined, analysis.item_paths,
      );
      if (regenRows.length === 0) {
        throw new Error('La rigenerazione non ha restituito righe valide');
      }

      const categories = pathOrderingCategoriesRef.current;
      const invalid = findInvalidInternalNodes(slots, regenRows, analysis.item_paths, categories);
      if (invalid.length > 0) {
        throw new Error(`Domande mancanti per: ${invalid.join(', ')}`);
      }

      const regenedBySlot = indexRowsBySlot(regenRows);
      let newRows = mergeSubtreeRows(analysis.rows, regenedBySlot, rootSlot);
      newRows = applyNluQuestionRules(slots, newRows, analysis.item_paths, categories);

      const subtreeSlots = collectSubtreeSlots(newRows, rootSlot);
      const targetSlots = getGrammarTargetSlots(
        subtreeSlots, newRows, overwriteGrammars, analysis.item_paths, categories,
      );
      if (targetSlots.length > 0) {
        const { rows: grammarRows, categories: nextCategories } = applyCategoryGrammarsWithTokens(
          newRows,
          grammarTokensRef.current,
          overwriteGrammars,
          analysis.item_paths,
          categories,
        );
        newRows = grammarRows;
        pathOrderingCategoriesRef.current = nextCategories;
      }

      setAnalysis({ ...analysis, rows: newRows });
      setAnalysisDirty(true);
      setDirtyRoots((prev) => prev.filter((r) => r !== rootSlot));
    } catch (e) {
      setRegenError(e instanceof Error ? e.message : String(e));
    } finally {
      setRegeningRoots((prev) => prev.filter((r) => r !== rootSlot));
    }
  }, [analysis]);

  const categories = pathOrderingCategoriesRef.current;
  const messagesReady = analysis
    ? isMessagesLayerReady(analysis.rows, analysis.item_paths, analysis.start_question, categories)
    : false;
  const grammarsReady = analysis
    ? isGrammarsLayerReady(analysis.rows, analysis.item_paths, categories)
    : false;
  const agentReady = analysis
    ? hasAgentContent(analysis.rows, categories)
    : false;
  const hasMessages = analysis
    ? hasMessagesContent(analysis.rows, analysis.item_paths, analysis.start_question)
    : false;
  const hasTaxonomy = (analysis?.rows.length ?? 0) > 0;
  const canGenerateGrammars = hasTaxonomy && !generating;
  const missingGrammarCount = analysis
    ? findCategoriesMissingGrammar(categories).length
    : 0;

  return {
    analysis, loading, initialLoadDone, saving, analysisDirty, generating, generatingPhase, agentGenProgress,
    generatingConfirmations, error, regenError,
    messagesReady, grammarsReady, hasMessages, agentReady, hasTaxonomy, canGenerateGrammars,
    missingGrammarCount,
    load, saveAnalysis, discardAnalysisChanges, updateAgentConfig, generateConfirmations, cancelGeneration,
    generateTaxonomy, generateMessagesFromText, createAgentFromDictionary,
    generateMessagesFromDictionary, generateMessagesOnly, reviewMessagesWithAi, generateGrammars, generateDictionaryCategoryGrammars, generateGrammarsWithAi, generateAgent, refineTaxonomy,
    updateRow, deleteRow, addRow, restructurePath,
    dirtyRoots, regeningRoots, regenSubtree, regenGrammarsSubtree, regenSubtreeFull,
    syncTaxonomyFromDictionary, syncTaxonomyFromLoadedRefs, syncTaxonomyFromLoadedRefsAsync, syncNotice, clearSyncNotice,
    bindGrammarTokens, bindPathOrderingCategories, syncGrammarsFromTokens, updateTokenGrammar,
  };
}
