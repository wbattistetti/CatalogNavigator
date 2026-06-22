/**
 * Composes domain hooks and UI state for the document editor shell.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildLeafDescriptionMap,
  getActiveTokens,
  loadSavedTokens,
  segmentAllDescriptions,
  type TokenDictionary,
} from '../../lib/tokenDictionary';
import { LARGE_DICTIONARY_TOKEN_THRESHOLD } from '../../lib/dictionaryLimits';
import {
  mergeAllDictionarySessionsIntoLoadedRefs,
  mergeLoadedTokens,
  type LoadedDictionaryRef,
} from '../../lib/multiDictionarySegment';
import { getPathOrderingCategories } from '../../lib/pathCanonicalize';
import type { KbDocument } from '../../lib/supabase';
import { supportsDictionaryFormat } from '../../lib/fileFormat';
import type { DictionaryPanelState } from '../../components/DocumentViewer/DictionaryPanel';
import { useProjectDictionaries } from '../../hooks/useProjectDictionaries';
import { useAnalysis, type GrammarEditTarget } from '../../hooks/useAnalysis';
import { useDocumentContent } from '../../hooks/useDocumentContent';
import {
  buildCorpusDescriptionsFromColumns,
  buildSelectorLeafPaths,
  corpusUsesSelectorFallback,
  hasSelectorColumn,
  primaryOntologyColumn,
  resolveCorpusColumns,
  resolveDataColumns,
  resolveDescriptionColumns,
  resolveSelectorColumns,
  shouldShowOntologyTab,
} from '../../lib/columnRoles';
import { useOntologyRefresh, type AgentDictionaryContext } from './useOntologyRefresh';
import { useCorpusExclusions } from './useCorpusExclusions';
import { useCatalogSanityReport } from './useCatalogSanityReport';
import { usePersistedSegmentationCache, lookupCorpusSegmentation } from '../../hooks/usePersistedSegmentationCache';
import { applySegmentExclusions } from '../../lib/corpusSegmentationOverrides';
import type { OntologyCorpusSegmentationValue } from '../ontology-corpus/OntologyCorpusSegmentationContext';

export type { AgentDictionaryContext };

export interface DisambiguationNavRequest {
  signature: string;
  focusGrammar?: boolean;
}

export interface UseDocumentEditorControllerOptions {
  doc: KbDocument;
  fileUrl: string;
  onDocUpdated: (doc: KbDocument) => void;
}

export function useDocumentEditorController({
  doc,
  fileUrl,
  onDocUpdated,
}: UseDocumentEditorControllerOptions) {
  const [dictState, setDictState] = useState<DictionaryPanelState | null>(null);
  const [disambiguationNavRequest, setDisambiguationNavRequest] = useState<DisambiguationNavRequest | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [convaiOpen, setConvaiOpen] = useState(false);
  const [convaiNoBeOpen, setConvaiNoBeOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [grammarEditTarget, setGrammarEditTarget] = useState<GrammarEditTarget | null>(null);
  const [grammarOverwrite, setGrammarOverwrite] = useState(false);

  const dictionaryMode = supportsDictionaryFormat(doc.format);
  const content = useDocumentContent(doc, fileUrl);
  const { updateTabular } = content;
  const documentText = content.text;
  const columnRoles = doc.column_roles ?? {};

  const ontologyColumns = useMemo(
    () => (content.tabular
      ? resolveCorpusColumns(content.tabular.headers, columnRoles)
      : []),
    [content.tabular, columnRoles],
  );

  const descriptionColumns = useMemo(
    () => (content.tabular
      ? resolveDescriptionColumns(content.tabular.headers, columnRoles)
      : []),
    [content.tabular, columnRoles],
  );

  const corpusFromSelectorFallback = useMemo(
    () => (content.tabular
      ? corpusUsesSelectorFallback(content.tabular.headers, columnRoles)
      : false),
    [content.tabular, columnRoles],
  );

  const selectorColumns = useMemo(
    () => (content.tabular
      ? resolveSelectorColumns(content.tabular.headers, columnRoles)
      : []),
    [content.tabular, columnRoles],
  );

  const dataColumns = useMemo(
    () => (content.tabular
      ? resolveDataColumns(content.tabular.headers, columnRoles)
      : []),
    [content.tabular, columnRoles],
  );

  const selectorLeafPaths = useMemo(() => {
    if (!content.tabular || !hasSelectorColumn(columnRoles)) {
      return { leafPaths: [] as string[], leafSourceData: {} as Record<string, Array<Record<string, string>>> };
    }
    return buildSelectorLeafPaths(content.tabular, columnRoles);
  }, [content.tabular, columnRoles]);

  const descriptionColumn = useMemo(
    () => primaryOntologyColumn(ontologyColumns),
    [ontologyColumns],
  );

  const dicts = useProjectDictionaries(doc, descriptionColumn, onDocUpdated);
  const analysisApi = useAnalysis(doc.id);
  const {
    corpusSegmentExclusions,
    corpusItemExclusions,
    removeCorpusSegment,
    excludeCorpusSegmentOccurrence,
    excludeCorpusItem,
    restoreCorpusItem,
  } = useCorpusExclusions(doc.id);
  const {
    load,
    initialLoadDone,
    syncItemPathsFromLoadedRefs,
    syncItemPathsFromSegmentationCache,
    syncNotice,
    bindGrammarTokens,
    bindPathOrderingCategories,
    syncGrammarsFromTokens,
    hasTaxonomy,
  } = analysisApi;

  const showOntologyTab = useMemo(
    () => dictionaryMode
      && !!content.tabular
      && shouldShowOntologyTab(content.tabular.headers, columnRoles, {
        hasSavedTaxonomy: hasTaxonomy,
        hasTokenDictionary: !!doc.token_dictionary,
      }),
    [dictionaryMode, content.tabular, columnRoles, hasTaxonomy, doc.token_dictionary],
  );

  useEffect(() => {
    setDictState(null);
    setDisambiguationNavRequest(null);
    setTestOpen(false);
    setConvaiOpen(false);
    setConvaiNoBeOpen(false);
    setSelectedSlot(null);
    setGrammarEditTarget(null);
  }, [doc.id]);

  useEffect(() => {
    void load();
  }, [doc.id, load]);

  const handleDictStateChange = useCallback((next: DictionaryPanelState) => {
    setDictState((prev) => {
      if (
        prev
        && prev.dirty === next.dirty
        && prev.canSave === next.canSave
        && prev.saving === next.saving
        && prev.activeTokenCount === next.activeTokenCount
        && prev.descriptionColumn === next.descriptionColumn
        && prev.ontologyColumns.join('\0') === next.ontologyColumns.join('\0')
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const handleGrammarSaved = useCallback(
    (result: { tokens: import('../../lib/tokenDictionary').TokenEntry[]; categories: import('../../lib/dictionaryTree').TokenCategory[] }) => {
      dictState?.replaceTokens(result.tokens);
      dictState?.replaceCategories(result.categories);
    },
    [dictState],
  );

  const leafDescriptionMap = useMemo(() => {
    if (!content.tabular) return null;
    const dict = dictState?.getMergedDictionary?.() ?? dictState?.getDictionary();
    const descriptions = dictState?.getDescriptions() ?? [];
    if (dict && descriptions.length > 0) {
      if (getActiveTokens(dict.tokens).length > LARGE_DICTIONARY_TOKEN_THRESHOLD) {
        return null;
      }
      const { rows } = segmentAllDescriptions(descriptions, dict.tokens, dict.categories ?? []);
      return buildLeafDescriptionMap(rows);
    }
    const saved = doc.token_dictionary;
    const descCol = saved?.descriptionColumn
      ?? primaryOntologyColumn(resolveCorpusColumns(content.tabular.headers, columnRoles));
    if (!saved || !descCol) return null;
    const corpus = buildCorpusDescriptionsFromColumns(
      content.tabular.headers,
      content.tabular.rows,
      resolveCorpusColumns(content.tabular.headers, columnRoles),
    ).filter(Boolean);
    const tokens = loadSavedTokens(saved, descCol);
    if (tokens.length === 0 || corpus.length === 0) return null;
    const { rows } = segmentAllDescriptions(corpus, tokens, saved?.categories ?? []);
    return buildLeafDescriptionMap(rows);
  }, [content.tabular, dictState, doc.token_dictionary, columnRoles]);

  const agentDictionaryContext = useMemo((): AgentDictionaryContext | null => {
    if (!dictionaryMode || !content.tabular || !showOntologyTab || ontologyColumns.length === 0) return null;
    if (dicts.loadedRefs.length === 0) return null;

    const liveRefs = mergeAllDictionarySessionsIntoLoadedRefs(
      dicts.loadedRefs,
      (id) => dicts.getSession(id),
    );

    const descriptions = dictState?.getDescriptions()
      ?? buildCorpusDescriptionsFromColumns(
        content.tabular.headers,
        content.tabular.rows,
        ontologyColumns,
      );

    if (descriptions.length === 0) return null;

    const tokens = mergeLoadedTokens(liveRefs);
    const activeTokenCount = getActiveTokens(tokens).length;
    if (activeTokenCount === 0) return null;

    return {
      dictionary: {
        descriptionColumn: descriptionColumn ?? ontologyColumns[0] ?? '',
        tokens,
        categories: getPathOrderingCategories(liveRefs),
      },
      descriptions,
      activeTokenCount,
    };
  }, [
    dictionaryMode,
    content.tabular,
    ontologyColumns,
    descriptionColumn,
    dictState,
    dicts.loadedRefs,
    dicts.getSession,
    dicts.dictionarySessionsRevision,
  ]);

  const corpusDescriptions = useMemo(() => {
    if (!content.tabular || ontologyColumns.length === 0) return [];
    return buildCorpusDescriptionsFromColumns(
      content.tabular.headers,
      content.tabular.rows,
      ontologyColumns,
    ).filter(Boolean);
  }, [content.tabular, ontologyColumns]);

  const [ontologyRefreshSanityNotice, setOntologyRefreshSanityNotice] = useState<'idle' | 'ready'>('idle');
  const [pendingCatalogReportTab, setPendingCatalogReportTab] = useState(false);

  const dismissOntologyRefreshSanityNotice = useCallback(() => {
    setOntologyRefreshSanityNotice('idle');
  }, []);

  const clearPendingCatalogReportTab = useCallback(() => {
    setPendingCatalogReportTab(false);
  }, []);

  const handleOntologyRefreshComplete = useCallback(({ cancelled }: { cancelled: boolean }) => {
    if (!cancelled) {
      setOntologyRefreshSanityNotice('ready');
      setPendingCatalogReportTab(true);
    }
  }, []);

  const liveLoadedRefs = useMemo(
    () => mergeAllDictionarySessionsIntoLoadedRefs(
      dicts.loadedRefs,
      (id) => dicts.getSession(id),
    ),
    [dicts.loadedRefs, dicts.getSession, dicts.dictionarySessionsRevision],
  );

  const pathOrderingCategories = useMemo(
    () => (liveLoadedRefs.length > 0 ? getPathOrderingCategories(liveLoadedRefs) : []),
    [liveLoadedRefs],
  );

  const corpusSegmentation = usePersistedSegmentationCache(
    doc.id,
    corpusDescriptions,
    liveLoadedRefs,
    pathOrderingCategories,
    {
      enabled: showOntologyTab && !!content.tabular && liveLoadedRefs.length > 0,
    },
  );

  const runOntologyRefresh = useCallback(async (
    descriptions: string[],
    loadedRefs: LoadedDictionaryRef[],
    options?: {
      mode?: 'resume' | 'fresh';
      onProgress?: (current: number, total: number) => void;
      shouldCancel?: () => boolean;
    },
  ) => {
    const { cache, cancelled } = await corpusSegmentation.buildCorpusSegmentation({
      mode: options?.mode ?? 'fresh',
      onProgress: options?.onProgress,
      shouldCancel: options?.shouldCancel,
    });

    // Path sync runs in background — do not block the UI after segmentation hits 100%.
    if (!cancelled && cache.size > 0 && loadedRefs.length > 0) {
      void syncItemPathsFromSegmentationCache(
        descriptions,
        cache,
        loadedRefs,
        { segmentExclusions: corpusSegmentExclusions },
      )
        .then(() => analysisApi.saveAnalysis())
        .catch(() => {
          /* error surfaced via analysisApi.error */
        });
    }

    return { cancelled, savedEntryCount: cache.size };
  }, [
    corpusSegmentation.buildCorpusSegmentation,
    syncItemPathsFromSegmentationCache,
    corpusSegmentExclusions,
    analysisApi,
  ]);

  const { agentNeedsUpdate, canRefreshOntology, showOntologyRefreshButton, ontologyRefreshDisabledReason, refreshingOntology, ontologyRefreshProgress, ontologyRefreshError, dismissOntologyRefreshError, partialSaveNotice, dismissPartialSaveNotice, segmentationResumePromptOpen, confirmSegmentationResume, dismissSegmentationResumePrompt, cancelOntologyRefresh, refreshOntology, buildLiveLoadedRefs } = useOntologyRefresh({
    dictState,
    agentDictionaryContext,
    corpusDescriptions,
    dicts,
    hasTaxonomy: analysisApi.hasTaxonomy,
    generating: analysisApi.generating,
    itemPaths: analysisApi.analysis?.item_paths,
    segmentExclusions: corpusSegmentExclusions,
    itemExclusions: corpusItemExclusions,
    partialSegmentationAvailable: corpusSegmentation.partialSegmentationAvailable,
    partialSegmentationProcessed: corpusSegmentation.progress.processed,
    partialSegmentationTotal: corpusSegmentation.progress.total,
    runOntologyRefresh,
    onCancelSegmentation: corpusSegmentation.cancelBuild,
    onRefreshComplete: handleOntologyRefreshComplete,
  });

  const corpusSegmentationContextValue = useMemo((): OntologyCorpusSegmentationValue => ({
    cache: corpusSegmentation.cache,
    progress: corpusSegmentation.progress,
    matchPhrases: corpusSegmentation.matchPhrases,
    lookup: (text: string) => {
      const base = lookupCorpusSegmentation(corpusSegmentation.cache, text.trim());
      if (!base) return undefined;
      const excluded = corpusSegmentExclusions.get(text.trim());
      if (!excluded || excluded.size === 0) return base;
      return applySegmentExclusions(base, excluded);
    },
    removeSegment: removeCorpusSegment,
    loadingPersisted: corpusSegmentation.loadingPersisted,
    building: corpusSegmentation.building,
    stale: corpusSegmentation.stale,
  }), [
    corpusSegmentation.cache,
    corpusSegmentation.progress,
    corpusSegmentation.matchPhrases,
    corpusSegmentation.loadingPersisted,
    corpusSegmentation.building,
    corpusSegmentation.stale,
    corpusSegmentExclusions,
    removeCorpusSegment,
  ]);

  const catalogDescriptions = useMemo(() => {
    const fromPanel = dictState?.getDescriptions() ?? agentDictionaryContext?.descriptions;
    if (fromPanel?.some((d) => d.trim().length > 0)) return fromPanel;
    return corpusDescriptions;
  }, [dictState, agentDictionaryContext, corpusDescriptions]);

  const catalogSanityCanCompute = !!(
    analysisApi.hasTaxonomy
    && agentDictionaryContext?.dictionary?.categories?.length
    && catalogDescriptions.some((line) => line.trim().length > 0)
  );

  const { catalogSanityReport, catalogSanityHasIssues } = useCatalogSanityReport({
    canCompute: catalogSanityCanCompute,
    documentName: doc.name,
    documentId: doc.id,
    dictionary: agentDictionaryContext?.dictionary,
    descriptions: catalogDescriptions,
    analysis: analysisApi.analysis,
    loadedRefs: liveLoadedRefs,
    leafDescriptionMap,
    dictionaryDirty: dictState?.dirty ?? false,
    analysisDirty: analysisApi.analysisDirty,
    pathsOutOfSync: agentNeedsUpdate,
    segmentExclusions: corpusSegmentExclusions,
    itemExclusions: corpusItemExclusions,
  });

  const handleDictionaryAfterSave = useCallback(
    async (_dictionary: TokenDictionary, descriptions: string[]) => {
      try {
        const liveRefs = buildLiveLoadedRefs();
        const tokens = mergeLoadedTokens(liveRefs);
        // Re-segment only if no ontology exists yet — once item_paths are set,
        // saving the dictionary must not overwrite them with re-segmented paths.
        if (!analysisApi.hasTaxonomy) {
          syncItemPathsFromLoadedRefs(descriptions, liveRefs, {
            segmentExclusions: corpusSegmentExclusions,
    itemExclusions: corpusItemExclusions,
          });
        }
        bindGrammarTokens(tokens);
        syncGrammarsFromTokens(tokens);
      } catch {
        /* error surfaced via analysisApi.error */
      }
    },
    [
      buildLiveLoadedRefs,
      analysisApi.hasTaxonomy,
      syncItemPathsFromLoadedRefs,
      bindGrammarTokens,
      syncGrammarsFromTokens,
      corpusSegmentExclusions,
      corpusItemExclusions,
    ],
  );

  const grammarTokens = useMemo(() => {
    if (agentDictionaryContext?.dictionary.tokens.length) {
      return agentDictionaryContext.dictionary.tokens;
    }
    const saved = doc.token_dictionary;
    const descCol = saved?.descriptionColumn
      ?? primaryOntologyColumn(resolveCorpusColumns(
        content.tabular?.headers ?? [],
        columnRoles,
      ));
    if (!saved || !descCol) return [];
    return loadSavedTokens(saved, descCol);
  }, [agentDictionaryContext, doc.token_dictionary, columnRoles, content.tabular]);

  useEffect(() => {
    bindGrammarTokens(grammarTokens);
    if (
      grammarTokens.length > 0
      && grammarTokens.length <= LARGE_DICTIONARY_TOKEN_THRESHOLD
      && analysisApi.hasTaxonomy
    ) {
      syncGrammarsFromTokens(grammarTokens);
    }
  }, [grammarTokens, analysisApi.hasTaxonomy, bindGrammarTokens, syncGrammarsFromTokens]);

  useEffect(() => {
    bindPathOrderingCategories(pathOrderingCategories);
  }, [pathOrderingCategories, bindPathOrderingCategories]);

  const agentMountRevision = useMemo(
    () => (agentDictionaryContext
      ? `${agentDictionaryContext.activeTokenCount}:${agentDictionaryContext.descriptions.length}`
      : null),
    [agentDictionaryContext],
  );
  const lastAgentMountRevision = useRef<string | null>(null);

  useEffect(() => {
    lastAgentMountRevision.current = null;
  }, [doc.id]);

  useEffect(() => {
    if (!dictionaryMode || !initialLoadDone || analysisApi.loading) return;
    if (!agentDictionaryContext || analysisApi.hasTaxonomy) return;
    if (agentDictionaryContext.activeTokenCount > LARGE_DICTIONARY_TOKEN_THRESHOLD) return;
    if (!agentMountRevision || lastAgentMountRevision.current === agentMountRevision) return;

    let cancelled = false;
    const runSync = () => {
      if (cancelled) return;
      try {
        const liveRefs = buildLiveLoadedRefs();
        if (liveRefs.length === 0) return;
        syncItemPathsFromLoadedRefs(agentDictionaryContext.descriptions, liveRefs, {
          segmentExclusions: corpusSegmentExclusions,
          itemExclusions: corpusItemExclusions,
        });
        // Mark only after sync actually ran — avoids skipping mount when idle callback is cancelled.
        lastAgentMountRevision.current = agentMountRevision;
      } catch {
        lastAgentMountRevision.current = agentMountRevision;
      }
    };

    if (typeof requestIdleCallback === 'function') {
      const idleId = requestIdleCallback(runSync, { timeout: 4000 });
      return () => {
        cancelled = true;
        cancelIdleCallback(idleId);
      };
    }
    const timeoutId = window.setTimeout(runSync, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    dictionaryMode,
    initialLoadDone,
    analysisApi.loading,
    analysisApi.hasTaxonomy,
    agentDictionaryContext,
    agentMountRevision,
    buildLiveLoadedRefs,
    syncItemPathsFromLoadedRefs,
    corpusSegmentExclusions,
    corpusItemExclusions,
  ]);

  const handleUnloadLibraryDictionary = useCallback(
    async (dictionaryId: string) => {
      try {
        const descriptions = dictState?.getDescriptions()
          ?? agentDictionaryContext?.descriptions
          ?? [];

        const updatedRefs = await dicts.unloadLibraryDictionary(dictionaryId);
        if (!updatedRefs) return;

        const liveRefs = mergeAllDictionarySessionsIntoLoadedRefs(
          updatedRefs,
          (id) => dicts.getSession(id),
        );

        if (descriptions.length > 0) {
          syncItemPathsFromLoadedRefs(descriptions, liveRefs, {
            segmentExclusions: corpusSegmentExclusions,
    itemExclusions: corpusItemExclusions,
          });
        }

        const tokens = mergeLoadedTokens(liveRefs);
        bindGrammarTokens(tokens);
        syncGrammarsFromTokens(tokens);
      } catch {
        /* error surfaced via dicts.error or analysisApi.error */
      }
    },
    [
      dictState,
      agentDictionaryContext,
      dicts,
      syncItemPathsFromLoadedRefs,
      bindGrammarTokens,
      syncGrammarsFromTokens,
      corpusSegmentExclusions,
      corpusItemExclusions,
    ],
  );

  const dictionaryCatalog = useMemo(
    () => ({
      available: dicts.available,
      getDictionaryMeta: dicts.getDictionaryMeta,
      moveCategoryToLibrary: dicts.moveCategoryToLibrary,
    }),
    [dicts.available, dicts.getDictionaryMeta, dicts.moveCategoryToLibrary],
  );

  const dictionarySessionActions = useMemo(
    () => ({
      setSessionTokens: dicts.setSessionTokens,
      setSessionCategories: dicts.setSessionCategories,
    }),
    [dicts.setSessionTokens, dicts.setSessionCategories],
  );

  const canSaveProject = dictionaryMode && (
    Boolean(dictState?.canSave)
    || (analysisApi.analysisDirty && analysisApi.canPersistAnalysis)
  );
  const savingProject = Boolean(dictState?.saving) || analysisApi.saving;

  const saveProject = useCallback(async () => {
    if (!dictionaryMode) return;
    if (dictState?.canSave) {
      await dictState.save();
    }
    if (analysisApi.analysisDirty && analysisApi.canPersistAnalysis) {
      await analysisApi.saveAnalysis();
    }
  }, [analysisApi, dictState, dictionaryMode]);

  const openDisambiguationMessage = useCallback((
    signature: string,
    opts?: { focusGrammar?: boolean },
  ) => {
    setDisambiguationNavRequest({
      signature,
      focusGrammar: opts?.focusGrammar ?? true,
    });
  }, []);

  const clearDisambiguationNavRequest = useCallback(() => {
    setDisambiguationNavRequest(null);
  }, []);

  /** Dictionary for disambiguation tab — panel state, agent bundle, or live project refs. */
  const disambiguationWorkspaceDictionary = useMemo((): TokenDictionary | null => {
    const fromPanel = dictState?.getMergedDictionary();
    if (fromPanel?.categories?.length) return fromPanel;

    if (agentDictionaryContext?.dictionary.categories?.length) {
      return agentDictionaryContext.dictionary;
    }

    if (liveLoadedRefs.length > 0) {
      const tokens = mergeLoadedTokens(liveLoadedRefs);
      const categories = getPathOrderingCategories(liveLoadedRefs);
      if (categories.length > 0 && getActiveTokens(tokens).length > 0) {
        return {
          descriptionColumn: descriptionColumn ?? ontologyColumns[0] ?? '',
          tokens,
          categories,
        };
      }
    }

    return fromPanel ?? agentDictionaryContext?.dictionary ?? null;
  }, [
    dictState,
    agentDictionaryContext,
    liveLoadedRefs,
    dicts.dictionarySessionsRevision,
    descriptionColumn,
    ontologyColumns,
  ]);

  const disambiguationDescriptions = useMemo(() => {
    if (corpusDescriptions.some((line) => line.trim().length > 0)) {
      return corpusDescriptions;
    }
    const fromPanel = dictState?.getDescriptions();
    if (fromPanel?.some((line) => line.trim().length > 0)) return fromPanel;
    if (agentDictionaryContext?.descriptions.some((line) => line.trim().length > 0)) {
      return agentDictionaryContext.descriptions;
    }
    return catalogDescriptions;
  }, [corpusDescriptions, dictState, agentDictionaryContext, catalogDescriptions]);

  return {
    doc,
    fileUrl,
    onDocUpdated,
    content,
    updateTabular,
    dictionaryMode,
    showOntologyTab,
    ontologyColumns,
    descriptionColumns,
    corpusFromSelectorFallback,
    selectorColumns,
    dataColumns,
    selectorLeafPaths,
    descriptionColumn,
    documentText,
    dicts,
    dictionaryCatalog,
    dictionarySessionActions,
    analysisApi,
    dictState,
    setDictState: handleDictStateChange,
    disambiguationNavRequest,
    openDisambiguationMessage,
    clearDisambiguationNavRequest,
    testOpen,
    setTestOpen,
    convaiOpen,
    setConvaiOpen,
    convaiNoBeOpen,
    setConvaiNoBeOpen,
    selectedSlot,
    setSelectedSlot,
    grammarEditTarget,
    setGrammarEditTarget,
    grammarOverwrite,
    setGrammarOverwrite,
    leafDescriptionMap,
    grammarTokens,
    handleDictionaryAfterSave,
    handleUnloadLibraryDictionary,
    handleGrammarSaved,
    handleTokenGrammarSaved: handleGrammarSaved,
    syncNotice,
    agentDictionaryContext,
    disambiguationWorkspaceDictionary,
    disambiguationDescriptions,
    agentNeedsUpdate,
    canRefreshOntology,
    showOntologyRefreshButton,
    ontologyRefreshDisabledReason,
    refreshingOntology,
    ontologyRefreshProgress,
    ontologyRefreshError,
    dismissOntologyRefreshError,
    partialSaveNotice,
    dismissPartialSaveNotice,
    segmentationResumePromptOpen,
    confirmSegmentationResume,
    dismissSegmentationResumePrompt,
    partialSegmentationProcessed: corpusSegmentation.progress.processed,
    partialSegmentationTotal: corpusSegmentation.progress.total,
    cancelOntologyRefresh,
    refreshOntology,
    buildLiveLoadedRefs,
    segmentationPersistError: corpusSegmentation.persistError,
    dismissSegmentationPersistError: corpusSegmentation.dismissPersistError,
    liveLoadedRefs,
    pathOrderingCategories,
    corpusSegmentationContextValue,
    corpusSegmentation,
      corpusSegmentExclusions,
    corpusItemExclusions,
    removeCorpusSegment,
    excludeCorpusSegmentOccurrence,
    excludeCorpusItem,
    restoreCorpusItem,
    catalogSanityReport,
    catalogSanityHasIssues,
    ontologyRefreshSanityNotice,
    dismissOntologyRefreshSanityNotice,
    pendingCatalogReportTab,
    clearPendingCatalogReportTab,
    canSaveProject,
    savingProject,
    saveProject,
  };
}

export type DocumentEditorController = ReturnType<typeof useDocumentEditorController>;
