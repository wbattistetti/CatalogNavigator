/**
 * Composes domain hooks and UI state for the document editor shell.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildLeafDescriptionMap,
  loadSavedTokens,
  segmentAllDescriptions,
} from '../../lib/tokenDictionary';
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

export function useDocumentEditorController({
  doc,
  fileUrl,
  onDocUpdated,
}: UseDocumentEditorControllerOptions) {
  const [dictState, setDictState] = useState<DictionaryPanelState | null>(null);
  const [affinaOpen, setAffinaOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [grammarEditTarget, setGrammarEditTarget] = useState<GrammarEditTarget | null>(null);
  const [grammarOverwrite, setGrammarOverwrite] = useState(false);
  const [showOnlyMessageNodes, setShowOnlyMessageNodes] = useState(false);

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
    syncTaxonomyFromDictionary,
    syncNotice,
    bindGrammarTokens,
    syncGrammarsFromTokens,
  } = analysisApi;

  useEffect(() => {
    setDictState(null);
    setAffinaOpen(false);
    setTestOpen(false);
    setSelectedSlot(null);
    setGrammarEditTarget(null);
  }, [doc.id]);

  useEffect(() => {
    void load();
  }, [doc.id, load]);

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

  const grammarTokens = useMemo(() => {
    const merged = dictState?.getMergedDictionary?.();
    if (merged?.tokens?.length) return merged.tokens;
    const dict = dictState?.getDictionary();
    if (dict?.tokens?.length) return dict.tokens;
    const saved = doc.token_dictionary;
    const descCol = saved?.descriptionColumn
      ?? Object.entries(doc.column_roles).find(([, r]) => r === 'description')?.[0];
    if (!saved || !descCol) return [];
    return loadSavedTokens(saved, descCol);
  }, [dictState, doc.token_dictionary, doc.column_roles]);

  useEffect(() => {
    bindGrammarTokens(grammarTokens);
    if (grammarTokens.length > 0) {
      syncGrammarsFromTokens(grammarTokens);
    }
  }, [grammarTokens, bindGrammarTokens, syncGrammarsFromTokens]);

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

  return {
    doc,
    fileUrl,
    onDocUpdated,
    content,
    dictionaryMode,
    descriptionColumn,
    documentText,
    dicts,
    analysisApi,
    dictState,
    setDictState,
    affinaOpen,
    setAffinaOpen,
    testOpen,
    setTestOpen,
    selectedSlot,
    setSelectedSlot,
    grammarEditTarget,
    setGrammarEditTarget,
    grammarOverwrite,
    setGrammarOverwrite,
    showOnlyMessageNodes,
    setShowOnlyMessageNodes,
    leafDescriptionMap,
    grammarTokens,
    handleDictionaryAfterSave,
    handleTokenGrammarSaved,
    syncNotice,
  };
}

export type DocumentEditorController = ReturnType<typeof useDocumentEditorController>;
