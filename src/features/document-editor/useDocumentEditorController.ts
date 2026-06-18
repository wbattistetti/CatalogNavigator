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
  primaryOntologyColumn,
  resolveOntologyColumns,
} from '../../lib/columnRoles';
import { useOntologyRefresh, type AgentDictionaryContext } from './useOntologyRefresh';

export type { AgentDictionaryContext };

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
  const [affinaOpen, setAffinaOpen] = useState(false);
  const [messagesPanelOpen, setMessagesPanelOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [convaiOpen, setConvaiOpen] = useState(false);
  const [convaiNoBeOpen, setConvaiNoBeOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [grammarEditTarget, setGrammarEditTarget] = useState<GrammarEditTarget | null>(null);
  const [grammarOverwrite, setGrammarOverwrite] = useState(false);

  const dictionaryMode = supportsDictionaryFormat(doc.format);
  const content = useDocumentContent(doc, fileUrl);
  const documentText = content.text;

  const ontologyColumns = useMemo(
    () => (content.tabular
      ? resolveOntologyColumns(content.tabular.headers, doc.column_roles ?? {})
      : []),
    [content.tabular, doc.column_roles],
  );

  const descriptionColumn = useMemo(
    () => primaryOntologyColumn(ontologyColumns),
    [ontologyColumns],
  );

  const dicts = useProjectDictionaries(doc, descriptionColumn, onDocUpdated);
  const analysisApi = useAnalysis(doc.id);
  const {
    load,
    initialLoadDone,
    syncTaxonomyFromLoadedRefs,
    syncTaxonomyFromLoadedRefsAsync,
    syncNotice,
    bindGrammarTokens,
    bindPathOrderingCategories,
    syncGrammarsFromTokens,
  } = analysisApi;

  useEffect(() => {
    setDictState(null);
    setAffinaOpen(false);
    setMessagesPanelOpen(false);
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
      ?? primaryOntologyColumn(resolveOntologyColumns(content.tabular.headers, doc.column_roles ?? {}));
    if (!saved || !descCol) return null;
    const corpus = buildCorpusDescriptionsFromColumns(
      content.tabular.headers,
      content.tabular.rows,
      resolveOntologyColumns(content.tabular.headers, doc.column_roles ?? {}),
    ).filter(Boolean);
    const tokens = loadSavedTokens(saved, descCol);
    if (tokens.length === 0 || corpus.length === 0) return null;
    const { rows } = segmentAllDescriptions(corpus, tokens, saved?.categories ?? []);
    return buildLeafDescriptionMap(rows);
  }, [content.tabular, dictState, doc.token_dictionary, doc.column_roles]);

  const agentDictionaryContext = useMemo((): AgentDictionaryContext | null => {
    if (!dictionaryMode || !content.tabular || ontologyColumns.length === 0) return null;
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

  const { agentNeedsUpdate, canRefreshOntology, refreshingOntology, ontologyRefreshProgress, cancelOntologyRefresh, refreshOntology, buildLiveLoadedRefs, liveLoadedRefs, pathOrderingCategories } = useOntologyRefresh({
    dictState,
    agentDictionaryContext,
    corpusDescriptions,
    dicts,
    hasTaxonomy: analysisApi.hasTaxonomy,
    generating: analysisApi.generating,
    itemPaths: analysisApi.analysis?.item_paths,
    syncTaxonomyFromLoadedRefsAsync,
  });

  const handleDictionaryAfterSave = useCallback(
    async (_dictionary: TokenDictionary, descriptions: string[]) => {
      try {
        const liveRefs = buildLiveLoadedRefs();
        const tokens = mergeLoadedTokens(liveRefs);
        // Re-segment only if no ontology exists yet — once item_paths are set,
        // saving the dictionary must not overwrite them with re-segmented paths.
        if (!analysisApi.hasTaxonomy) {
          syncTaxonomyFromLoadedRefs(descriptions, liveRefs);
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
      syncTaxonomyFromLoadedRefs,
      bindGrammarTokens,
      syncGrammarsFromTokens,
    ],
  );

  const grammarTokens = useMemo(() => {
    if (agentDictionaryContext?.dictionary.tokens.length) {
      return agentDictionaryContext.dictionary.tokens;
    }
    const saved = doc.token_dictionary;
    const descCol = saved?.descriptionColumn
      ?? primaryOntologyColumn(resolveOntologyColumns(
        content.tabular?.headers ?? [],
        doc.column_roles ?? {},
      ));
    if (!saved || !descCol) return [];
    return loadSavedTokens(saved, descCol);
  }, [agentDictionaryContext, doc.token_dictionary, doc.column_roles, content.tabular]);

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
        syncTaxonomyFromLoadedRefs(agentDictionaryContext.descriptions, liveRefs);
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
    syncTaxonomyFromLoadedRefs,
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
          syncTaxonomyFromLoadedRefs(descriptions, liveRefs);
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
      syncTaxonomyFromLoadedRefs,
      bindGrammarTokens,
      syncGrammarsFromTokens,
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
    || (analysisApi.analysisDirty && analysisApi.hasTaxonomy)
  );
  const savingProject = Boolean(dictState?.saving) || analysisApi.saving;

  const saveProject = useCallback(async () => {
    if (!dictionaryMode) return;
    if (dictState?.canSave) {
      await dictState.save();
    }
    if (analysisApi.analysisDirty && analysisApi.hasTaxonomy) {
      await analysisApi.saveAnalysis();
    }
  }, [analysisApi, dictState, dictionaryMode]);

  return {
    doc,
    fileUrl,
    onDocUpdated,
    content,
    dictionaryMode,
    ontologyColumns,
    descriptionColumn,
    ontologyColumns,
    documentText,
    dicts,
    dictionaryCatalog,
    dictionarySessionActions,
    analysisApi,
    dictState,
    setDictState: handleDictStateChange,
    affinaOpen,
    setAffinaOpen,
    messagesPanelOpen,
    setMessagesPanelOpen,
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
    agentNeedsUpdate,
    canRefreshOntology,
    refreshingOntology,
    ontologyRefreshProgress,
    cancelOntologyRefresh,
    refreshOntology,
    buildLiveLoadedRefs,
    liveLoadedRefs,
    pathOrderingCategories,
    canSaveProject,
    savingProject,
    saveProject,
  };
}

export type DocumentEditorController = ReturnType<typeof useDocumentEditorController>;
