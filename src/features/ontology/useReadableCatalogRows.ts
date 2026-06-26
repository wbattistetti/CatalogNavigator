/**
 * Resolves live readable-catalog rows — one per document corpus line.
 */
import { useMemo } from 'react';
import { useDocumentEditorController } from '../document-editor/DocumentEditorContext';
import {
  buildCorpusSegmentationInputFromLoadedRefs,
  resolveCorpusSegmentationRows,
} from '../../lib/corpusItemPaths';
import {
  buildReadableCatalogRowsFromSegmentation,
  countPendingReadableCatalog,
} from '../../lib/readableCatalog';

export function useReadableCatalogRows() {
  const {
    agentDictionaryContext,
    dictState,
    liveLoadedRefs,
    corpusSegmentExclusions,
    corpusItemExclusions,
    analysisApi,
  } = useDocumentEditorController();

  const { analysis, hasTaxonomy } = analysisApi;

  const descriptions = useMemo(
    () => dictState?.getDescriptions() ?? agentDictionaryContext?.descriptions ?? [],
    [agentDictionaryContext?.descriptions, dictState],
  );

  const segmentationRows = useMemo(() => {
    if (!liveLoadedRefs.length || descriptions.length === 0) return [];
    try {
      const segInput = buildCorpusSegmentationInputFromLoadedRefs(
        descriptions,
        liveLoadedRefs,
        corpusSegmentExclusions,
        corpusItemExclusions,
      );
      return resolveCorpusSegmentationRows(segInput);
    } catch {
      return [];
    }
  }, [
    corpusItemExclusions,
    corpusSegmentExclusions,
    descriptions,
    liveLoadedRefs,
  ]);

  const rows = useMemo(
    () => buildReadableCatalogRowsFromSegmentation(
      segmentationRows,
      analysis?.readable_catalog,
    ),
    [analysis?.readable_catalog, segmentationRows],
  );

  const pendingCount = countPendingReadableCatalog(rows);

  return {
    rows,
    segmentationRows,
    hasTaxonomy,
    pendingCount,
    totalCount: rows.length,
    updateReadableCatalogEntry: analysisApi.updateReadableCatalogEntry,
  };
}
