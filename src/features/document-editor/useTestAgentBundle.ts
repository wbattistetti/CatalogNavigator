/**
 * Compiles the preview AgentBundle used by the global VB test rail.
 */
import { useMemo } from 'react';
import { compileAgentBundle } from '../../lib/compileAgentBundle';
import type { AgentBundle } from '../../lib/agentBundleTypes';
import {
  buildCorpusSegmentationInputFromLoadedRefs,
  resolveCorpusSegmentationRows,
} from '../../lib/corpusItemPaths';
import type { RowSegmentation } from '../../lib/tokenDictionary';
import { useDocumentEditorController } from './DocumentEditorContext';

function useTestAgentCompileInput() {
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
    if (!dictionary || !analysis) return null;
    if (!descriptions.some((d) => d.trim().length > 0)) return null;

    return {
      documentName: doc.name,
      documentId: doc.id,
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
    };
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

export function useTestAgentBundle(): AgentBundle | null {
  const input = useTestAgentCompileInput();

  return useMemo(() => {
    if (!input) return null;
    try {
      return compileAgentBundle({ ...input, mode: 'preview' });
    } catch {
      return null;
    }
  }, [input]);
}

/** One row per document description line (for Test Plan accordion). */
export function useTestPlanSegmentationRows(): RowSegmentation[] {
  const input = useTestAgentCompileInput();

  return useMemo(() => {
    if (!input) return [];
    const segInput = input.loadedRefs?.length
      ? buildCorpusSegmentationInputFromLoadedRefs(
        input.descriptions,
        input.loadedRefs,
        input.segmentExclusions,
        input.itemExclusions,
      )
      : {
        descriptions: input.descriptions,
        dictionary: input.dictionary,
        segmentExclusions: input.segmentExclusions,
        itemExclusions: input.itemExclusions,
      };
    return resolveCorpusSegmentationRows(segInput);
  }, [input]);
}
