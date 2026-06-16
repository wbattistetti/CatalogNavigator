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
import { resolveDescriptionColumn } from '../../lib/columnRoles';
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
  const [testOpen, setTestOpen] = useState(false);
  const [convaiOpen, setConvaiOpen] = useState(false);
  const [convaiNoBeOpen, setConvaiNoBeOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [grammarEditTarget, setGrammarEditTarget] = useState<GrammarEditTarget | null>(null);
  const [grammarOverwrite, setGrammarOverwrite] = useState(false);

  const dictionaryMode = supportsDictionaryFormat(doc.format);
  const content = useDocumentContent(doc, fileUrl);
  const documentText = content.text;

  const descriptionColumn = useMemo(
    () => (content.tabular
      ? resolveDescriptionColumn(content.tabular.headers, doc.column_roles ?? {})
      : null),
    [content.tabular, doc.column_roles],
  );

  const dicts = useProjectDictionaries(doc, descriptionColumn, onDocUpdated);
  const analysisApi = useAnalysis(doc.id);
  const {
    load,
    initialLoadDone,
    syncTaxonomyFromLoadedRefs,
    syncNotice,
    bindGrammarTokens,
    bindPathOrderingCategories,
    syncGrammarsFromTokens,
  } = analysisApi;

  useEffect(() => {
    setDictState(null);
    setAffinaOpen(false);
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
      const { rows } = segmentAllDescriptions(descriptions, dict.tokens, dict.categories ?? []);
      return buildLeafDescriptionMap(rows);
    }
    const saved = doc.token_dictionary;
    const descCol = saved?.descriptionColumn
      ?? Object.entries(doc.column_roles).find(([, r]) => r === 'description')?.[0];
    if (!saved || !descCol) return null;
    const idx = content.tabular.headers.indexOf(descCol);
    if (idx < 0) return null;
    const corpus = content.tabular.rows
      .map((row) => String(row[idx] ?? '').trim())
      .filter(Boolean);
    const tokens = loadSavedTokens(saved, descCol);
    if (tokens.length === 0 || corpus.length === 0) return null;
    const { rows } = segmentAllDescriptions(corpus, tokens, saved?.categories ?? []);
    return buildLeafDescriptionMap(rows);
  }, [content.tabular, dictState, doc.token_dictionary, doc.column_roles]);

  const agentDictionaryContext = useMemo((): AgentDictionaryContext | null => {
    if (!dictionaryMode || !content.tabular || !descriptionColumn) return null;
    if (dicts.loadedRefs.length === 0) return null;

    const liveRefs = mergeAllDictionarySessionsIntoLoadedRefs(
      dicts.loadedRefs,
      (id) => dicts.getSession(id),
    );

    const descriptions = dictState?.getDescriptions()
      ?? content.tabular.rows.map((row) => {
        const idx = content.tabular!.headers.indexOf(descriptionColumn);
        return idx >= 0 ? String(row[idx] ?? '') : '';
      });

    if (descriptions.length === 0) return null;

    const tokens = mergeLoadedTokens(liveRefs);
    const activeTokenCount = getActiveTokens(tokens).length;
    if (activeTokenCount === 0) return null;

    return {
      dictionary: {
        descriptionColumn,
        tokens,
        categories: getPathOrderingCategories(liveRefs),
      },
      descriptions,
      activeTokenCount,
    };
  }, [
    dictionaryMode,
    content.tabular,
    descriptionColumn,
    dictState,
    dicts.loadedRefs,
    dicts.getSession,
    dicts.dictionarySessionsRevision,
  ]);

  const { agentNeedsUpdate, canRefreshOntology, refreshOntology, buildLiveLoadedRefs, liveLoadedRefs, pathOrderingCategories } = useOntologyRefresh({
    dictState,
    agentDictionaryContext,
    dicts,
    hasTaxonomy: analysisApi.hasTaxonomy,
    generating: analysisApi.generating,
    itemPaths: analysisApi.analysis?.item_paths,
    syncTaxonomyFromLoadedRefs,
  });

  const handleDictionaryAfterSave = useCallback(
    async (_dictionary: TokenDictionary, descriptions: string[]) => {
      try {
        const liveRefs = buildLiveLoadedRefs();
        syncTaxonomyFromLoadedRefs(descriptions, liveRefs);
        bindGrammarTokens(mergeLoadedTokens(liveRefs));
        syncGrammarsFromTokens(mergeLoadedTokens(liveRefs));
      } catch {
        /* error surfaced via analysisApi.error */
      }
    },
    [buildLiveLoadedRefs, syncTaxonomyFromLoadedRefs, bindGrammarTokens, syncGrammarsFromTokens],
  );

  const grammarTokens = useMemo(() => {
    if (agentDictionaryContext?.dictionary.tokens.length) {
      return agentDictionaryContext.dictionary.tokens;
    }
    const saved = doc.token_dictionary;
    const descCol = saved?.descriptionColumn
      ?? Object.entries(doc.column_roles).find(([, r]) => r === 'description')?.[0];
    if (!saved || !descCol) return [];
    return loadSavedTokens(saved, descCol);
  }, [agentDictionaryContext, doc.token_dictionary, doc.column_roles]);

  useEffect(() => {
    bindGrammarTokens(grammarTokens);
    if (grammarTokens.length > 0 && analysisApi.hasTaxonomy) {
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
    if (!agentMountRevision || lastAgentMountRevision.current === agentMountRevision) return;

    lastAgentMountRevision.current = agentMountRevision;
    try {
      const liveRefs = buildLiveLoadedRefs();
      if (liveRefs.length === 0) return;
      syncTaxonomyFromLoadedRefs(agentDictionaryContext.descriptions, liveRefs);
    } catch {
      lastAgentMountRevision.current = null;
    }
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

  return {
    doc,
    fileUrl,
    onDocUpdated,
    content,
    dictionaryMode,
    descriptionColumn,
    documentText,
    dicts,
    dictionaryCatalog,
    dictionarySessionActions,
    analysisApi,
    dictState,
    setDictState: handleDictStateChange,
    affinaOpen,
    setAffinaOpen,
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
    refreshOntology,
    buildLiveLoadedRefs,
    liveLoadedRefs,
    pathOrderingCategories,
  };
}

export type DocumentEditorController = ReturnType<typeof useDocumentEditorController>;
