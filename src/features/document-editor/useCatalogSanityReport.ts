/**
 * Computes catalog integrity report from current editor compile inputs.
 */
import { useMemo } from 'react';
import { compileAgentBundle } from '../../lib/compileAgentBundle';
import type { CatalogSanityReport } from '../../lib/catalogSanity';
import { hasCatalogSanityIssues } from '../../lib/catalogSanity';
import type { CorpusItemExclusions, CorpusSegmentExclusions } from '../../lib/corpusItemPaths';
import type { LoadedDictionaryRef } from '../../lib/multiDictionarySegment';
import type { TokenDictionary } from '../../lib/tokenDictionary';
import type { Analysis } from '../../lib/analysisTypes';

export interface CatalogSanityReportInput {
  canCompute: boolean;
  documentName: string;
  documentId: string;
  dictionary: TokenDictionary | null | undefined;
  descriptions: string[];
  analysis: Analysis | null | undefined;
  loadedRefs?: LoadedDictionaryRef[];
  leafDescriptionMap?: Map<string, string>;
  dictionaryDirty?: boolean;
  analysisDirty?: boolean;
  pathsOutOfSync?: boolean;
  segmentExclusions?: CorpusSegmentExclusions;
  itemExclusions?: CorpusItemExclusions;
}

export function computeCatalogSanityReport(
  input: CatalogSanityReportInput,
): CatalogSanityReport | null {
  if (!input.canCompute || !input.analysis || !input.dictionary) return null;
  try {
    const bundle = compileAgentBundle({
      documentName: input.documentName,
      documentId: input.documentId,
      dictionary: input.dictionary,
      descriptions: input.descriptions,
      analysis: input.analysis,
      loadedRefs: input.loadedRefs?.length ? input.loadedRefs : undefined,
      leafDescriptionMap: input.leafDescriptionMap,
      dictionaryDirty: input.dictionaryDirty,
      analysisDirty: input.analysisDirty,
      pathsOutOfSync: input.pathsOutOfSync,
      segmentExclusions: input.segmentExclusions,
      itemExclusions: input.itemExclusions,
    });
    return bundle.meta.catalogSanity ?? null;
  } catch {
    return null;
  }
}

export function useCatalogSanityReport(input: CatalogSanityReportInput): {
  catalogSanityReport: CatalogSanityReport | null;
  catalogSanityHasIssues: boolean;
} {
  const catalogSanityReport = useMemo(
    () => computeCatalogSanityReport(input),
    [
      input.canCompute,
      input.documentName,
      input.documentId,
      input.dictionary,
      input.descriptions,
      input.analysis,
      input.loadedRefs,
      input.leafDescriptionMap,
      input.dictionaryDirty,
      input.analysisDirty,
      input.pathsOutOfSync,
      input.segmentExclusions,
      input.itemExclusions,
    ],
  );

  return {
    catalogSanityReport,
    catalogSanityHasIssues: hasCatalogSanityIssues(catalogSanityReport),
  };
}
