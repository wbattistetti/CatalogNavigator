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
import { mergeLoadedTokens } from '../../lib/multiDictionarySegment';
import { normalizeItemPaths } from '../../lib/itemPaths';
import type { KbDocument } from '../../lib/supabase';
import { supportsDictionaryFormat } from '../../lib/fileFormat';
import type { DictionaryPanelState } from '../../components/DocumentViewer/DictionaryPanel';
import { useProjectDictionaries } from '../../hooks/useProjectDictionaries';
import { useAnalysis, type GrammarEditTarget } from '../../hooks/useAnalysis';
import { useDocumentContent } from '../../hooks/useDocumentContent';
import { resolveDescriptionColumn } from '../../lib/columnRoles';

export interface UseDocumentEditorControllerOptions {
  doc: KbDocument;
  fileUrl: string;
  onDocUpdated: (doc: KbDocument) => void;
}

export type AgentDictionaryContext = {
  dictionary: TokenDictionary;
  descriptions: string[];
  activeTokenCount: number;
};

function agentLeafPathsMatchDictionary(
  leafPaths: string[],
  itemPaths: string[] | null | undefined,
): boolean {
  const a = normalizeItemPaths(leafPaths);
  const b = normalizeItemPaths(itemPaths ?? []);
  if (a.length !== b.length) return false;
  return a.every((path, index) => path === b[index]);
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
    createAgentFromDictionary,
    syncTaxonomyFromDictionary,
    syncNotice,
    bindGrammarTokens,
    syncGrammarsFromTokens,
  } = analysisApi;

  useEffect(() => {
    setDictState(null);
    setAffinaOpen(false);
    setTestOpen(false);
    setConvaiOpen(false);
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

  const handleDictionaryAfterSave = useCallback(
    async (dictionary: Parameters<typeof syncTaxonomyFromDictionary>[0], descriptions: string[]) => {
      try {
        syncTaxonomyFromDictionary(dictionary, descriptions);
        bindGrammarTokens(dictionary.tokens);
        syncGrammarsFromTokens(dictionary.tokens);
      } catch {
        /* error surfaced via analysisApi.error */
      }
    },
    [syncTaxonomyFromDictionary, bindGrammarTokens, syncGrammarsFromTokens],
  );

  const handleTokenGrammarSaved = useCallback(
    (tokens: import('../../lib/tokenDictionary').TokenEntry[]) => {
      dictState?.replaceTokens(tokens);
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

    if (dictState) {
      const dictionary = dictState.getMergedDictionary?.() ?? dictState.getDictionary();
      const descriptions = dictState.getDescriptions();
      if (dictionary && descriptions.length > 0 && dictState.activeTokenCount > 0) {
        return {
          dictionary,
          descriptions,
          activeTokenCount: dictState.activeTokenCount,
        };
      }
    }

    const idx = content.tabular.headers.indexOf(descriptionColumn);
    if (idx < 0 || dicts.loadedRefs.length === 0) return null;

    const descriptions = content.tabular.rows.map((row) => String(row[idx] ?? ''));
    const mergedTokens = mergeLoadedTokens(dicts.loadedRefs);
    const activeTokenCount = getActiveTokens(mergedTokens).length;
    if (activeTokenCount === 0) return null;

    return {
      dictionary: {
        descriptionColumn,
        tokens: mergedTokens,
        categories: dicts.loadedRefs.flatMap((ref) => ref.dictionary.categories ?? []),
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
  ]);

  const agentNeedsUpdate = useMemo(() => {
    if (!agentDictionaryContext || !analysisApi.hasTaxonomy) return false;
    const { leafPaths } = segmentAllDescriptions(
      agentDictionaryContext.descriptions,
      agentDictionaryContext.dictionary.tokens,
      agentDictionaryContext.dictionary.categories ?? [],
    );
    if (leafPaths.length === 0) return false;
    return !agentLeafPathsMatchDictionary(leafPaths, analysisApi.analysis?.item_paths);
  }, [agentDictionaryContext, analysisApi.hasTaxonomy, analysisApi.analysis?.item_paths]);

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
      createAgentFromDictionary(
        agentDictionaryContext.dictionary,
        agentDictionaryContext.descriptions,
        doc.name,
        documentText ?? '',
      );
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
    createAgentFromDictionary,
    doc.name,
    documentText,
  ]);

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
    selectedSlot,
    setSelectedSlot,
    grammarEditTarget,
    setGrammarEditTarget,
    grammarOverwrite,
    setGrammarOverwrite,
    leafDescriptionMap,
    grammarTokens,
    handleDictionaryAfterSave,
    handleTokenGrammarSaved,
    syncNotice,
    agentDictionaryContext,
    agentNeedsUpdate,
  };
}

export type DocumentEditorController = ReturnType<typeof useDocumentEditorController>;
