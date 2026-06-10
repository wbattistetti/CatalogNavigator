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
import { reconcileItemPaths, resolveItemPaths } from '../lib/itemPaths';
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
  applyAnswerGrammarsToRows,
  applyTemplateGrammarsWithTokens,
} from '../lib/grammarTemplate';
import {
  segmentAllDescriptions,
  type TokenDictionary,
  type TokenEntry,
} from '../lib/tokenDictionary';
import {
  findTokensMissingGrammar,
  setTokenGrammar,
  syncRowGrammarsFromTokens,
} from '../lib/tokenGrammar';
import { syncTaxonomyFromLeafPaths, type TaxonomySyncResult } from '../lib/taxonomyPathSync';
import type {
  AgentGenProgress,
  Analysis,
  AnalysisRow,
  GeneratingPhase,
  GrammarEditMode,
  GrammarEditTarget,
  GrammarEntry,
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
  const itemPaths = reconcileItemPaths(
    rawRows.map((r) => r.slot_filling),
    data.item_paths ?? null,
  );
  const rows = migrateDualGrammars(normalizeGrammarRows(rawRows), itemPaths);
  const slots = rows.map((r) => r.slot_filling);
  return {
    ...data,
    start_question: data.start_question ?? null,
    confirmation_preamble: data.confirmation_preamble ?? 'Quindi confermo:',
    item_paths: reconcileItemPaths(slots, data.item_paths ?? null),
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
    ? reconcileItemPaths(slots, item_paths)
    : reconcileItemPaths(slots, existing?.item_paths ?? null);
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
    setAgentGenProgress({ current: 0, total: roots.length, rootSlot: 'preparazione' });
    await yieldToUi();

    let currentRows = applyDeterministicMessagesLayer(taxonomyRows, itemPaths);
    await yieldToUi();
    const allSlotsAfterDet = currentRows.map((r) => r.slot_filling);
    currentRows = applyNluQuestionRules(allSlotsAfterDet, currentRows, itemPaths);
    await yieldToUi();
    currentRows = stampDeterministicMessageLayer(currentRows, itemPaths);
    setAnalysis(draftWithStart(documentId, currentRows, existing));
    setAnalysisDirty(true);
    await yieldToUi();

    const isComplete = (slot: string, row: AnalysisRow) =>
      isMessagesNodeComplete(allSlots, slot, row, itemPaths);
    const forceAiReview = options?.forceAiReview ?? false;

    for (let i = 0; i < roots.length; i++) {
      throwIfAborted(signal);
      const rootSlot = roots[i]!;
      setAgentGenProgress({ current: i + 1, total: roots.length, rootSlot });

      const subtreeSlots = collectSubtreeSlots(currentRows, rootSlot);
      const interactiveSlots = getInteractiveMessageSlots(subtreeSlots, itemPaths);

      if (
        interactiveSlots.length === 0
        || (!forceAiReview && isSubtreeMessagesComplete(currentRows, rootSlot, itemPaths))
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
      );

      throwIfAborted(signal);

      const invalid = findInvalidMessagesNodes(subtreeSlots, regenRows, itemPaths);
      if (invalid.length > 0) {
        throw new Error(`Messaggi mancanti per ${rootSlot}: ${invalid.join(', ')}`);
      }

      const regenedBySlot = indexRowsBySlot(regenRows);
      currentRows = mergeSubtreeMessageRows(currentRows, regenedBySlot, rootSlot, false, isComplete);
      currentRows = applyNluQuestionRules(
        currentRows.map((r) => r.slot_filling),
        currentRows,
        itemPaths,
      );
      currentRows = stampAiMessageSubtree(currentRows, rootSlot, itemPaths);
      setAnalysis(draftWithStart(documentId, currentRows, existing));
    }

    const finalSlots = currentRows.map((r) => r.slot_filling);
    currentRows = applyNluQuestionRules(finalSlots, currentRows, itemPaths);
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
    setAnalysis(draftAnalysis(documentId, currentRows, existing));
    setAnalysisDirty(true);

    const isComplete = (slot: string, row: AnalysisRow) =>
      isGrammarNodeComplete(allSlots, slot, row);

    for (let i = 0; i < roots.length; i++) {
      throwIfAborted(signal);
      const rootSlot = roots[i]!;
      const subtreeSlots = collectSubtreeSlots(currentRows, rootSlot);
      const targetSlots = getGrammarTargetSlots(subtreeSlots, currentRows, overwriteExisting);

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

        currentRows = applyAnswerGrammarsToRows(
          currentRows,
          overwriteExisting,
          existing?.item_paths,
        );
        if (grammarTokensRef.current.length > 0) {
          currentRows = syncRowGrammarsFromTokens(currentRows, grammarTokensRef.current);
        }

        const invalid = findInvalidGrammarNodes(batch, currentRows, existing?.item_paths);
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

    let finalRows = applyAnswerGrammarsToRows(currentRows, false, existing?.item_paths ?? null);
    if (grammarTokensRef.current.length > 0) {
      finalRows = syncRowGrammarsFromTokens(finalRows, grammarTokensRef.current);
    }
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
      setSyncNotice(null);
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

  /** Structural tree sync from dictionary segmentation; preserves unchanged NLU. */
  const syncTaxonomyFromDictionary = useCallback((
    dictionary: TokenDictionary,
    descriptions: string[],
  ): TaxonomySyncResult | null => {
    setError(null);
    const { leafPaths } = segmentAllDescriptions(
      descriptions,
      dictionary.tokens,
      dictionary.categories ?? [],
    );
    if (leafPaths.length === 0) {
      setSyncNotice(null);
      return null;
    }
    try {
      const result = syncTaxonomyFromLeafPaths(
        leafPaths,
        analysis?.rows,
        analysis?.item_paths,
      );
      applyTaxonomySyncResult(result, analysis);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }, [analysis, applyTaxonomySyncResult]);

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
      const result = syncTaxonomyFromLeafPaths(leafPaths, null, null);
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

  /** Deterministic tree from dictionary, then IA messages. */
  const generateMessagesFromDictionary = useCallback(async (
    dictionary: TokenDictionary,
    descriptions: string[],
    documentName: string,
    documentText?: string,
  ) => {
    const signal = beginGenerationAbort();
    setGenerating(true);
    setGeneratingPhase('taxonomy');
    setError(null);
    try {
      throwIfAborted(signal);
      const { leafPaths } = segmentAllDescriptions(
        descriptions,
        dictionary.tokens,
        dictionary.categories ?? [],
      );
      if (leafPaths.length === 0) {
        throw new Error('Nessuna descrizione segmentata con il dizionario corrente');
      }
      const { rows: builtRows, item_paths } = buildTaxonomyFromItemPaths(leafPaths);
      const taxonomyRows = mergeTaxonomyForMessageRegen(builtRows, analysis?.rows);
      const draft = draftAnalysis(documentId, taxonomyRows, analysis, item_paths);
      setAnalysis(draft);
      setGeneratingPhase('messages');
      const finalRows = await generateMessagesByRootChunks(
        taxonomyRows,
        documentName,
        documentText ?? '',
        draft,
        signal,
      );
      setAnalysis(draftWithStart(documentId, finalRows, draft));
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

  /** Generates token grammars (rule-based) and syncs rows + answer grammars on nodes. */
  const generateGrammars = useCallback(async (
    tokens: TokenEntry[],
    _documentText: string,
    _documentName: string,
    overwriteExisting = false,
  ): Promise<TokenEntry[]> => {
    if (!analysis) {
      throw new Error('Nessuna analisi caricata');
    }
    if (analysis.rows.length === 0) {
      throw new Error('Genera prima la tassonomia');
    }
    const allSlots = analysis.rows.map((r) => r.slot_filling);
    if (!overwriteExisting) {
      const missing = findTokensMissingGrammar(allSlots, tokens);
      if (missing.length === 0) {
        setError(null);
        return tokens;
      }
    }

    setGenerating(true);
    setGeneratingPhase('grammars');
    setAgentGenProgress({ current: 0, total: tokens.length, rootSlot: 'preparazione' });
    setError(null);

    try {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const { rows: newRows, tokens: nextTokens } = applyTemplateGrammarsWithTokens(
        analysis.rows,
        tokens,
        overwriteExisting,
        analysis.item_paths,
      );
      grammarTokensRef.current = nextTokens;
      setGrammarTokensBound(nextTokens);
      setAgentGenProgress({
        current: nextTokens.length,
        total: nextTokens.length,
        rootSlot: 'completato',
      });
      setAnalysis(applyStartQuestionIfMissing({ ...analysis, rows: newRows }));
      setAnalysisDirty(true);
      setDirtyRoots([]);
      await new Promise((resolve) => setTimeout(resolve, 400));
      return nextTokens;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setGenerating(false);
      setGeneratingPhase(null);
      setAgentGenProgress(null);
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
      const missing = findInvalidGrammarNodes(allSlots, analysis.rows, analysis.item_paths);
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

      const targetSlots = getGrammarTargetSlots(subtreeSlots, analysis.rows, overwriteExisting);
      if (targetSlots.length === 0) return;

      let newRows = applyAnswerGrammarsToRows(
        analysis.rows, overwriteExisting, analysis.item_paths,
      );
      if (grammarTokensRef.current.length > 0) {
        newRows = syncRowGrammarsFromTokens(newRows, grammarTokensRef.current);
      }

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
      item_paths: reconcileItemPaths(slots, nextItems),
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

      const invalid = findInvalidInternalNodes(slots, regenRows, analysis.item_paths);
      if (invalid.length > 0) {
        throw new Error(`Domande mancanti per: ${invalid.join(', ')}`);
      }

      const regenedBySlot = indexRowsBySlot(regenRows);
      let newRows = mergeSubtreeRows(analysis.rows, regenedBySlot, rootSlot);
      newRows = applyNluQuestionRules(slots, newRows, analysis.item_paths);

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
      item_paths: reconcileItemPaths(slots, analysis.item_paths),
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
        item_paths: reconcileItemPaths(slots, remappedItems),
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

      const invalid = findInvalidInternalNodes(slots, regenRows, analysis.item_paths);
      if (invalid.length > 0) {
        throw new Error(`Domande mancanti per: ${invalid.join(', ')}`);
      }

      const regenedBySlot = indexRowsBySlot(regenRows);
      let newRows = mergeSubtreeRows(analysis.rows, regenedBySlot, rootSlot);
      newRows = applyNluQuestionRules(slots, newRows, analysis.item_paths);

      const subtreeSlots = collectSubtreeSlots(newRows, rootSlot);
      const targetSlots = getGrammarTargetSlots(subtreeSlots, newRows, overwriteGrammars);
      if (targetSlots.length > 0) {
        newRows = applyAnswerGrammarsToRows(newRows, overwriteGrammars, analysis.item_paths);
        if (grammarTokensRef.current.length > 0) {
          newRows = syncRowGrammarsFromTokens(newRows, grammarTokensRef.current);
        }
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

  const messagesReady = analysis
    ? isMessagesLayerReady(analysis.rows, analysis.item_paths, analysis.start_question)
    : false;
  const grammarsReady = analysis ? isGrammarsLayerReady(analysis.rows, analysis.item_paths) : false;
  const agentReady = analysis ? hasAgentContent(analysis.rows) : false;
  const hasMessages = analysis
    ? hasMessagesContent(analysis.rows, analysis.item_paths, analysis.start_question)
    : false;
  const hasTaxonomy = (analysis?.rows.length ?? 0) > 0;
  const canGenerateGrammars = hasTaxonomy && !generating;
  const missingGrammarCount = analysis
    ? (grammarTokensBound.length > 0
      ? findTokensMissingGrammar(
        analysis.rows.map((r) => r.slot_filling),
        grammarTokensBound,
      ).length
      : findInvalidGrammarNodes(
        analysis.rows.map((r) => r.slot_filling),
        analysis.rows,
        analysis.item_paths,
      ).length)
    : 0;

  return {
    analysis, loading, initialLoadDone, saving, analysisDirty, generating, generatingPhase, agentGenProgress,
    generatingConfirmations, error, regenError,
    messagesReady, grammarsReady, hasMessages, agentReady, hasTaxonomy, canGenerateGrammars,
    missingGrammarCount,
    load, saveAnalysis, discardAnalysisChanges, updateAgentConfig, generateConfirmations, cancelGeneration,
    generateTaxonomy, generateMessagesFromText, createAgentFromDictionary,
    generateMessagesFromDictionary, generateMessagesOnly, reviewMessagesWithAi, generateGrammars, generateGrammarsWithAi, generateAgent, refineTaxonomy,
    updateRow, deleteRow, addRow, restructurePath,
    dirtyRoots, regeningRoots, regenSubtree, regenGrammarsSubtree, regenSubtreeFull,
    syncTaxonomyFromDictionary, syncNotice, clearSyncNotice,
    bindGrammarTokens, syncGrammarsFromTokens, updateTokenGrammar,
  };
}
