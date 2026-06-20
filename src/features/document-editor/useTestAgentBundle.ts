/**
 * Compiles the preview AgentBundle used by the global VB test rail.
 */
import { useMemo } from 'react';
import { compileAgentBundle } from '../../lib/compileAgentBundle';
import type { AgentBundle } from '../../lib/agentBundleTypes';
import { useDocumentEditorController } from './DocumentEditorContext';

export function useTestAgentBundle(): AgentBundle | null {
  const {
    doc,
    dictState,
    agentDictionaryContext,
    agentNeedsUpdate,
    liveLoadedRefs,
    leafDescriptionMap,
    corpusSegmentExclusions,
    corpusItemExclusions,
    analysisApi,
  } = useDocumentEditorController();

  const { analysis, analysisDirty } = analysisApi;

  return useMemo(() => {
    const dictionary = dictState?.getMergedDictionary() ?? agentDictionaryContext?.dictionary ?? null;
    const descriptions = dictState?.getDescriptions()
      ?? agentDictionaryContext?.descriptions
      ?? [];
    if (!dictionary || !analysis?.rows?.length) return null;
    try {
      return compileAgentBundle({
        documentName: doc.name,
        documentId: doc.id,
        mode: 'preview',
        dictionary,
        descriptions,
        analysis,
        leafDescriptionMap: leafDescriptionMap ?? undefined,
        loadedRefs: liveLoadedRefs,
        dictionaryDirty: dictState?.dirty ?? false,
        analysisDirty,
        pathsOutOfSync: agentNeedsUpdate,
        segmentExclusions: corpusSegmentExclusions,
        itemExclusions: corpusItemExclusions,
      });
    } catch {
      return null;
    }
  }, [
    agentDictionaryContext,
    agentNeedsUpdate,
    analysis,
    analysisDirty,
    dictState,
    doc.id,
    doc.name,
    leafDescriptionMap,
    liveLoadedRefs,
    corpusSegmentExclusions,
    corpusItemExclusions,
  ]);
}
