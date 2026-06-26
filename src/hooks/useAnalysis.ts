/**
 * Analysis state for corpus ontology (item_paths + disambiguation plan) — no taxonomy tree.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  applyCategoryGrammars,
  clearCategoryGrammars,
  findCategoriesMissingGrammar,
} from '../lib/categoryGrammar';
import {
  resolveCorpusItemPaths,
  resolveCorpusItemPathsFromSegmentationCacheAsync,
  buildCorpusSegmentationInputFromLoadedRefs,
  type CorpusSegmentExclusions,
} from '../lib/corpusItemPaths';
import { yieldToMainThread, type CorpusSegmentationEntry } from '../lib/corpusSegmentationCache';
import { segmentAllDescriptions, type TokenDictionary, type TokenEntry } from '../lib/tokenDictionary';
import { setTokenGrammar } from '../lib/tokenGrammar';
import { getPathOrderingCategories } from '../lib/pathCanonicalize';
import type { TokenCategory } from '../lib/dictionaryTree';
import type { DisambiguationEditorRow } from '../lib/disambiguationPlanMessages';
import {
  buildPlanResultFromStorage,
  compileDisambiguationAnswerGrammar,
  editorRowsToStorage,
  hasSavedDisambiguationContent,
} from '../lib/disambiguationPlanMessages';
import type { DisambiguationPlanResult, DisambiguationPlanStorage } from '../lib/disambiguationPlanTypes';
import { runGenerateDisambiguationMessages } from '../lib/runGenerateDisambiguationMessages';
import { resolveItemPaths } from '../lib/itemPaths';
import { syncItemPaths } from '../lib/itemPathSync';
import {
  hasDisambiguationMessages,
  hasOntologyItemPaths,
  hasPersistableAnalysisState,
  isAgentReady,
  isGrammarsReady,
  isMessagesReady,
} from '../lib/analysisReadiness';
import type {
  AgentGenProgress,
  Analysis,
  AnalysisRow,
  DisambiguationGenProgress,
  GeneratingPhase,
  GrammarEditMode,
  GrammarEditTarget,
  GrammarEntry,
  RowStatus,
} from '../lib/analysisTypes';
import type { ReadableCatalogStorage } from '../lib/readableCatalog';
import {
  parseReadableCatalog,
  pruneReadableCatalog,
  readableCatalogKey,
} from '../lib/readableCatalog';
import {
  createSavedChatTest,
  mergeSavedChatTests,
  parseSavedChatTests,
  preserveSavedChatTestsOnReload,
  type SavedChatMessageInput,
  type SavedChatTestsStorage,
} from '../lib/savedChatTests';
import { normalizeConfirmationPreamble } from '../lib/confirmationPrompts';

export type {
  AgentGenProgress,
  Analysis,
  AnalysisRow,
  DisambiguationGenProgress,
  GeneratingPhase,
  GrammarEditMode,
  GrammarEditTarget,
  GrammarEntry,
  RowStatus,
} from '../lib/analysisTypes';

function parseDisambiguationPlan(raw: unknown): DisambiguationPlanStorage | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as DisambiguationPlanStorage;
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object' && Array.isArray((raw as DisambiguationPlanStorage).messages)) {
    return raw as DisambiguationPlanStorage;
  }
  return null;
}

/** Loads analysis from DB — rows are always discarded (legacy tree removed). */
function normalizeLoadedAnalysis(data: Analysis): Analysis {
  const legacySlots = (data.rows ?? []).map((r) => r.slot_filling);
  const itemPaths = data.item_paths?.length
    ? data.item_paths
    : resolveItemPaths(legacySlots, null);

  return {
    ...data,
    rows: [],
    start_question: data.start_question ?? null,
    confirmation_preamble: normalizeConfirmationPreamble(data.confirmation_preamble),
    disambiguation_plan: parseDisambiguationPlan(data.disambiguation_plan),
    readable_catalog: parseReadableCatalog(data.readable_catalog),
    saved_chat_tests: parseSavedChatTests(data.saved_chat_tests),
    item_paths: itemPaths.length > 0 ? itemPaths : null,
  };
}

function draftAnalysis(
  documentId: string,
  itemPaths: string[],
  existing?: Analysis | null,
): Analysis {
  const now = new Date().toISOString();
  return {
    id: existing?.id ?? '',
    document_id: documentId,
    rows: [],
    item_paths: itemPaths.length > 0 ? itemPaths : null,
    start_question: existing?.start_question ?? null,
    confirmation_preamble: normalizeConfirmationPreamble(existing?.confirmation_preamble),
    disambiguation_plan: existing?.disambiguation_plan ?? null,
    readable_catalog: existing?.readable_catalog ?? null,
    saved_chat_tests: existing?.saved_chat_tests ?? null,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
}

async function persistAnalysis(documentId: string, analysis: Analysis): Promise<Analysis> {
  await supabase.from('kb_analyses').delete().eq('document_id', documentId);
  const payload = {
    document_id: documentId,
    rows: [],
    item_paths: analysis.item_paths ?? [],
    start_question: analysis.start_question,
    confirmation_preamble: analysis.confirmation_preamble,
    disambiguation_plan: analysis.disambiguation_plan ?? null,
    readable_catalog: analysis.readable_catalog ?? null,
    saved_chat_tests: analysis.saved_chat_tests ?? null,
  };
  const { data: inserted, error } = await supabase
    .from('kb_analyses')
    .insert(payload)
    .select()
    .single();
  if (error) {
    if (
      (analysis.disambiguation_plan || analysis.readable_catalog || analysis.saved_chat_tests)
      && /disambiguation_plan|readable_catalog|saved_chat_tests|column|schema cache/i.test(error.message)
    ) {
      throw new Error(
        `${error.message} — Esegui la migration Supabase: npx supabase db push.`,
      );
    }
    throw new Error(error.message);
  }
  const persisted = inserted as Analysis;
  if (analysis.disambiguation_plan && !parseDisambiguationPlan(persisted.disambiguation_plan)) {
    throw new Error(
      'disambiguation_plan non salvato nel database. Applica la migration: npx supabase db push',
    );
  }
  return persisted;
}

function buildSyncNotice(summary: { addedItemPaths: number; removedItemPaths: number }): string {
  const parts: string[] = [];
  if (summary.addedItemPaths > 0) parts.push(`+${summary.addedItemPaths} item`);
  if (summary.removedItemPaths > 0) parts.push(`-${summary.removedItemPaths} item`);
  return parts.length > 0 ? `Ontologia aggiornata: ${parts.join(', ')}` : 'Ontologia aggiornata';
}

export function useAnalysis(documentId: string) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  /** In-memory saved VB chats — survives tab switches and DB round-trips without the column. */
  const [savedChatTests, setSavedChatTests] = useState<SavedChatTestsStorage>([]);
  const savedChatTestsRef = useRef<SavedChatTestsStorage>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analysisDirty, setAnalysisDirty] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingPhase, setGeneratingPhase] = useState<GeneratingPhase>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [disambiguationGenProgress, setDisambiguationGenProgress] = useState<DisambiguationGenProgress | null>(null);
  /** Full BFS graph — survives tab unmount; restored from storage on load when missing. */
  const [disambiguationPlanResult, setDisambiguationPlanResult] = useState<DisambiguationPlanResult | null>(null);
  const generationAbortRef = useRef<AbortController | null>(null);
  const grammarTokensRef = useRef<TokenEntry[]>([]);
  const [grammarTokensBound, setGrammarTokensBound] = useState<TokenEntry[]>([]);
  const pathOrderingCategoriesRef = useRef<TokenCategory[]>([]);

  const bindPathOrderingCategories = useCallback((categories: TokenCategory[]) => {
    pathOrderingCategoriesRef.current = categories;
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

  const syncSavedChatTests = useCallback((
    next: SavedChatTestsStorage,
    syncAnalysis = true,
  ) => {
    savedChatTestsRef.current = next;
    setSavedChatTests(next);
    if (!syncAnalysis) return;
    setAnalysis((prev) => {
      const base = prev ?? draftAnalysis(documentId, [], null);
      return {
        ...base,
        saved_chat_tests: next.length > 0 ? next : null,
        updated_at: new Date().toISOString(),
      };
    });
  }, [documentId]);

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
      const sessionTests = savedChatTestsRef.current;

      setAnalysis((prev) => {
        if (loaded && hasOntologyItemPaths(loaded)) {
          const mergedTests = mergeSavedChatTests(
            sessionTests,
            loaded.saved_chat_tests ?? [],
          );
          return { ...loaded, saved_chat_tests: mergedTests.length > 0 ? mergedTests : null };
        }
        if (prev && hasOntologyItemPaths(prev) && prev.document_id === documentId) return prev;
        if (loaded) {
          const mergedTests = mergeSavedChatTests(
            sessionTests,
            loaded.saved_chat_tests ?? [],
          );
          return { ...loaded, saved_chat_tests: mergedTests.length > 0 ? mergedTests : null };
        }
        return loaded;
      });

      if (loaded) {
        const mergedTests = mergeSavedChatTests(
          sessionTests,
          loaded.saved_chat_tests ?? [],
        );
        savedChatTestsRef.current = mergedTests;
        setSavedChatTests(mergedTests);
      }
      setAnalysisDirty(false);
      setSyncNotice(null);
    } finally {
      setLoading(false);
      setInitialLoadDone(true);
    }
  }, [documentId]);

  useEffect(() => {
    setAnalysis(null);
    setSavedChatTests([]);
    savedChatTestsRef.current = [];
    setDisambiguationPlanResult(null);
    setInitialLoadDone(false);
    setLoading(true);
  }, [documentId]);

  /** Instant shell from persisted messages — no BFS until user clicks Calcola. */
  useEffect(() => {
    const storage = analysis?.disambiguation_plan;
    if (!storage || !hasSavedDisambiguationContent(storage)) {
      setDisambiguationPlanResult(null);
      return;
    }
    setDisambiguationPlanResult((prev) => {
      if (prev && storage.computedAt && prev.computedAt === storage.computedAt) {
        return prev;
      }
      return buildPlanResultFromStorage(storage);
    });
  }, [analysis?.disambiguation_plan, analysis?.id]);

  const saveAnalysis = useCallback(async () => {
    if (!analysis || !hasPersistableAnalysisState(analysis)) return;
    setSaving(true);
    setError(null);
    try {
      const toPersist: Analysis = {
        ...analysis,
        saved_chat_tests: savedChatTestsRef.current.length > 0
          ? savedChatTestsRef.current
          : null,
      };
      const persisted = await persistAnalysis(documentId, toPersist);
      const normalized = normalizeLoadedAnalysis(persisted);
      const preserved = preserveSavedChatTestsOnReload(
        savedChatTestsRef.current,
        normalized.saved_chat_tests ?? [],
      );
      savedChatTestsRef.current = preserved;
      setSavedChatTests(preserved);
      setAnalysis({
        ...normalized,
        saved_chat_tests: preserved.length > 0 ? preserved : null,
      });
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

  const updateDisambiguationPlan = useCallback((plan: DisambiguationPlanStorage) => {
    setAnalysis((prev) => {
      const base = prev ?? draftAnalysis(documentId, [], null);
      return {
        ...base,
        disambiguation_plan: plan,
        updated_at: new Date().toISOString(),
      };
    });
    setAnalysisDirty(true);
  }, [documentId]);

  const updateReadableCatalogEntry = useCallback((
    sourceText: string,
    update: {
      text?: string;
      status?: RowStatus;
    },
  ) => {
    const storageKey = readableCatalogKey(sourceText);
    if (!storageKey) return;

    setAnalysis((prev) => {
      const base = prev ?? draftAnalysis(documentId, [], null);
      const current = base.readable_catalog?.[storageKey];
      const fallbackText = storageKey;
      const nextText = update.text !== undefined
        ? update.text.trim() || fallbackText
        : current?.text?.trim() || fallbackText;

      let nextStatus: RowStatus = update.status !== undefined
        ? update.status
        : current?.status ?? null;

      if (update.text !== undefined && update.status === undefined) {
        nextStatus = nextText !== fallbackText ? 'approved' : current?.status ?? null;
      }

      const shouldPersist = nextStatus !== null || nextText !== fallbackText;
      const nextCatalog: ReadableCatalogStorage = { ...(base.readable_catalog ?? {}) };

      if (!shouldPersist) {
        delete nextCatalog[storageKey];
      } else {
        nextCatalog[storageKey] = { text: nextText, status: nextStatus };
      }

      return {
        ...base,
        readable_catalog: Object.keys(nextCatalog).length > 0 ? nextCatalog : null,
        updated_at: new Date().toISOString(),
      };
    });
    setAnalysisDirty(true);
  }, [documentId]);

  const addSavedChatTest = useCallback((
    messages: readonly SavedChatMessageInput[],
    finalPath: string | null,
  ): SavedChatTestsStorage[number] | null => {
    if (messages.length === 0) return null;

    const prev = savedChatTestsRef.current;
    const created = createSavedChatTest(messages, finalPath, prev.length);
    syncSavedChatTests([...prev, created]);
    setAnalysisDirty(true);
    return created;
  }, [syncSavedChatTests]);

  const saveChatTest = useCallback((
    messages: readonly SavedChatMessageInput[],
    finalPath: string | null,
  ): SavedChatTestsStorage[number] | null => {
    if (messages.length === 0) return null;

    const prev = savedChatTestsRef.current;
    const created = createSavedChatTest(messages, finalPath, prev.length);
    const nextTests = [...prev, created];
    syncSavedChatTests(nextTests);
    setAnalysisDirty(true);

    const base = analysis ?? draftAnalysis(documentId, [], null);
    const nextAnalysis: Analysis = {
      ...base,
      saved_chat_tests: nextTests,
      updated_at: new Date().toISOString(),
    };

    if (hasPersistableAnalysisState(nextAnalysis)) {
      void (async () => {
        setSaving(true);
        setError(null);
        try {
          await persistAnalysis(documentId, nextAnalysis);
          setAnalysisDirty(false);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        } finally {
          setSaving(false);
        }
      })();
    }

    return created;
  }, [analysis, documentId, syncSavedChatTests]);

  const removeSavedChatTest = useCallback((id: string) => {
    const next = savedChatTestsRef.current.filter((test) => test.id !== id);
    syncSavedChatTests(next);
    setAnalysisDirty(true);
  }, [syncSavedChatTests]);

  /** Commits catalog paths resolved from live segmentation (e.g. after Calcola). */
  const commitResolvedItemPaths = useCallback((itemPaths: string[]) => {
    const normalized = itemPaths.map((p) => p.trim()).filter(Boolean);
    if (normalized.length === 0) return;

    setAnalysis((prev) => {
      const base = prev ?? draftAnalysis(documentId, normalized, null);
      const current = base.item_paths ?? [];
      if (
        current.length === normalized.length
        && current.every((path, index) => path === normalized[index])
      ) {
        return prev ?? base;
      }
      return {
        ...base,
        item_paths: normalized,
        updated_at: new Date().toISOString(),
      };
    });
    setAnalysisDirty(true);
  }, [documentId]);

  const applyItemPathSync = useCallback((
    leafPaths: string[],
    existing?: Analysis | null,
  ): Analysis | null => {
    if (leafPaths.length === 0) {
      setSyncNotice(null);
      return null;
    }
    const base = existing ?? analysis ?? null;
    const result = syncItemPaths(leafPaths, base?.item_paths);
    if (result.pathsUnchanged && base) {
      setSyncNotice('Ontologia aggiornata — path invariati rispetto al corpus corrente.');
      return base;
    }
    const next = draftAnalysis(documentId, result.item_paths, base);
    const prunedCatalog = pruneReadableCatalog(
      base?.readable_catalog,
      [],
      result.item_paths,
    );
    if (prunedCatalog !== base?.readable_catalog) {
      next.readable_catalog = prunedCatalog;
    }
    setAnalysis(next);
    setAnalysisDirty(true);
    setSyncNotice(buildSyncNotice(result.summary));
    return next;
  }, [analysis, documentId]);

  /** Updates item_paths from live corpus segmentation (dictionary mount / save). */
  const syncItemPathsFromLoadedRefs = useCallback((
    descriptions: string[],
    loadedRefs: LoadedDictionaryRef[],
    options?: { segmentExclusions?: CorpusSegmentExclusions },
  ): Analysis | null => {
    setError(null);
    try {
      if (loadedRefs.length > 0) {
        pathOrderingCategoriesRef.current = getPathOrderingCategories(loadedRefs);
      }
      const leafPaths = resolveCorpusItemPaths(
        buildCorpusSegmentationInputFromLoadedRefs(
          descriptions,
          loadedRefs,
          options?.segmentExclusions,
        ),
      );
      return applyItemPathSync(leafPaths, analysis);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }, [analysis, applyItemPathSync]);

  /** Updates item_paths from persisted segmentation cache after Crea/Ricrea ontologia. */
  const syncItemPathsFromSegmentationCache = useCallback(async (
    descriptions: string[],
    cache: ReadonlyMap<string, CorpusSegmentationEntry>,
    loadedRefs: LoadedDictionaryRef[],
    options?: {
      segmentExclusions?: CorpusSegmentExclusions;
      onProgress?: (current: number, total: number) => void;
    },
  ): Promise<Analysis> => {
    setError(null);
    if (loadedRefs.length > 0) {
      pathOrderingCategoriesRef.current = getPathOrderingCategories(loadedRefs);
    }
    const segInput = buildCorpusSegmentationInputFromLoadedRefs(
      descriptions,
      loadedRefs,
      options?.segmentExclusions,
    );
    const leafPaths = await resolveCorpusItemPathsFromSegmentationCacheAsync(
      segInput,
      cache,
      options?.onProgress,
    );
    await yieldToMainThread();
    if (leafPaths.length === 0) {
      throw new Error('Impossibile risolvere i path catalogo dalla segmentazione corpus.');
    }
    const next = applyItemPathSync(leafPaths, analysis);
    if (!next) {
      throw new Error('Impossibile sincronizzare i path catalogo.');
    }
    return next;
  }, [analysis, applyItemPathSync]);

  const clearSyncNotice = useCallback(() => setSyncNotice(null), []);

  const createAgentFromDictionary = useCallback((
    dictionary: TokenDictionary,
    descriptions: string[],
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

    setAnalysis((current) => {
      if (hasOntologyItemPaths(current)) {
        outcome = 'existing';
        return current;
      }
      outcome = 'mounted';
      if (dictionary.categories?.length) {
        pathOrderingCategoriesRef.current = dictionary.categories;
      }
      return draftAnalysis(documentId, leafPaths, current);
    });

    if (outcome === 'mounted') {
      setAnalysisDirty(true);
      setSyncNotice(`Ontologia montata: ${leafPaths.length} prestazioni`);
    }
  }, [documentId]);

  const generateDisambiguationMessages = useCallback(async (
    editorRows: DisambiguationEditorRow[],
    documentName: string,
    documentText?: string,
    options?: { forceAll?: boolean; computedAt?: string | null },
  ) => {
    const targets = options?.forceAll
      ? editorRows
      : editorRows.filter((r) => !r.question?.trim());

    if (targets.length === 0) return;

    const totalChunks = Math.ceil(targets.length / 12);
    const startedAt = Date.now();
    const signal = beginGenerationAbort();

    setGenerating(true);
    setGeneratingPhase('disambiguation');
    setDisambiguationGenProgress({
      processedMessages: 0,
      totalMessages: targets.length,
      processedChunks: 0,
      totalChunks,
      startedAt,
    });
    setError(null);
    try {
      const generated = await runGenerateDisambiguationMessages(
        targets,
        documentName,
        documentText,
        signal,
        {
          onProgress: ({ processedMessages, totalMessages, processedChunks, totalChunks: chunks }) => {
            setDisambiguationGenProgress({
              processedMessages,
              totalMessages,
              processedChunks,
              totalChunks: chunks,
              startedAt,
            });
          },
        },
      );
      setAnalysis((prev) => {
        const base = prev ?? draftAnalysis(documentId, [], null);
        const bySig = new Map(
          (base.disambiguation_plan?.messages ?? []).map((m) => [m.signature, m]),
        );
        for (const row of generated) {
          bySig.set(row.signature, row);
        }
        const mergedRows: DisambiguationEditorRow[] = editorRows.map((row) => {
          const saved = bySig.get(row.signature);
          if (!saved) return row;
          return {
            ...row,
            question: saved.question,
            no_match_1: saved.no_match_1,
            no_match_2: saved.no_match_2,
            no_match_3: saved.no_match_3,
            answer_grammar: saved.answer_grammar ?? row.answer_grammar ?? compileDisambiguationAnswerGrammar(row.options),
            source: saved.source ?? 'ai',
            status: saved.status ?? null,
          };
        });
        const storage = editorRowsToStorage(
          mergedRows,
          options?.computedAt ?? base.disambiguation_plan?.computedAt ?? null,
        );
        return { ...base, disambiguation_plan: storage, updated_at: new Date().toISOString() };
      });
      setAnalysisDirty(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setGenerating(false);
      setGeneratingPhase(null);
      setDisambiguationGenProgress(null);
      clearGenerationAbort();
    }
  }, [documentId, beginGenerationAbort, clearGenerationAbort]);

  const syncGrammarsFromTokens = useCallback((tokens: TokenEntry[]) => tokens, []);

  const updateTokenGrammar = useCallback((tokenText: string, grammar: GrammarEntry) => {
    const dictTokens = grammarTokensRef.current;
    const nextTokens = setTokenGrammar(dictTokens, tokenText, grammar);
    grammarTokensRef.current = nextTokens;
    setGrammarTokensBound(nextTokens);
    return nextTokens;
  }, []);

  const bindGrammarTokens = useCallback((tokens: TokenEntry[]) => {
    grammarTokensRef.current = tokens;
    setGrammarTokensBound(tokens);
  }, []);

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
      const baseCategories = overwriteExisting
        ? clearCategoryGrammars(categories)
        : categories;
      const nextCategories = applyCategoryGrammars(baseCategories, tokens, overwriteExisting);
      grammarTokensRef.current = tokens;
      setGrammarTokensBound(tokens);
      return nextCategories;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setGenerating(false);
      setGeneratingPhase(null);
    }
  }, []);

  const categories = pathOrderingCategoriesRef.current;
  const hasTaxonomy = hasOntologyItemPaths(analysis);
  const canPersistAnalysis = hasPersistableAnalysisState(analysis);
  const grammarsReady = isGrammarsReady(categories);
  const messagesReady = isMessagesReady(analysis);
  const hasMessages = hasDisambiguationMessages(analysis);
  const agentReady = isAgentReady(analysis, categories);
  const canGenerateGrammars = hasTaxonomy && !generating;
  const missingGrammarCount = findCategoriesMissingGrammar(categories).length;

  return {
    analysis,
    loading,
    initialLoadDone,
    saving,
    analysisDirty,
    generating,
    generatingPhase,
    agentGenProgress: null as AgentGenProgress | null,
    disambiguationGenProgress,
    disambiguationPlanResult,
    setDisambiguationPlanResult,
    generatingConfirmations: false,
    error,
    regenError: null,
    messagesReady,
    grammarsReady,
    hasMessages,
    agentReady,
    hasTaxonomy,
    canPersistAnalysis,
    canGenerateGrammars,
    commitResolvedItemPaths,
    missingGrammarCount,
    load,
    saveAnalysis,
    discardAnalysisChanges,
    updateAgentConfig,
    updateDisambiguationPlan,
    updateReadableCatalogEntry,
    addSavedChatTest,
    saveChatTest,
    removeSavedChatTest,
    savedChatTests,
    cancelGeneration,
    generateDisambiguationMessages,
    generateDictionaryCategoryGrammars,
    createAgentFromDictionary,
    syncItemPathsFromLoadedRefs,
    syncItemPathsFromSegmentationCache,
    syncNotice,
    clearSyncNotice,
    bindGrammarTokens,
    bindPathOrderingCategories,
    syncGrammarsFromTokens,
    updateTokenGrammar,
    grammarTokensBound,
  };
}
