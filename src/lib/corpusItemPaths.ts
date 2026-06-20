/**
 * Resolves runtime catalog item paths from in-memory corpus descriptions + dictionary.
 * Single source of truth for agent bundle compile and Convai export.
 */
import { normalizeCategoryOrders, type TokenCategory } from './dictionaryTree';
import { normalizeItemPaths } from './itemPaths';
import {
  canonicalizeItemPaths,
  canonicalizeItemPathsFromLoadedRefs,
  getPathOrderingCategories,
} from './pathCanonicalize';
import {
  segmentAllDescriptionsFromLoadedRefs,
  mergeLoadedTokens,
  type LoadedDictionaryRef,
} from './multiDictionarySegment';
import {
  applyExclusionsToRows,
  type CorpusItemExclusions,
  type CorpusSegmentExclusions,
} from './corpusSegmentationOverrides';

export type { CorpusItemExclusions };
import {
  buildLeafDescriptionMap,
  segmentAllDescriptions,
  type RowSegmentation,
  type TokenDictionary,
} from './tokenDictionary';

export type { CorpusSegmentExclusions, CorpusItemExclusions };

export interface CorpusSegmentationInput {
  descriptions: string[];
  dictionary: TokenDictionary;
  loadedRefs?: LoadedDictionaryRef[];
  /** Right-column manual segment removals (authoritative for compile). */
  segmentExclusions?: CorpusSegmentExclusions;
  /** Whole corpus rows omitted from catalog compile. */
  itemExclusions?: CorpusItemExclusions;
}

export function buildCorpusSegmentationInputFromLoadedRefs(
  descriptions: string[],
  loadedRefs: LoadedDictionaryRef[],
  segmentExclusions?: CorpusSegmentExclusions,
  itemExclusions?: CorpusItemExclusions,
): CorpusSegmentationInput {
  return {
    descriptions,
    dictionary: {
      descriptionColumn: '',
      tokens: mergeLoadedTokens(loadedRefs),
      categories: getPathOrderingCategories(loadedRefs),
    },
    loadedRefs,
    segmentExclusions,
    itemExclusions,
  };
}

export interface CorpusSegmentationResult {
  leafPaths: string[];
  rows: RowSegmentation[];
}

/** Segments every corpus description row with the current in-memory dictionary. */
export function segmentCorpusDescriptions(
  input: CorpusSegmentationInput,
): CorpusSegmentationResult {
  const descriptions = input.descriptions
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (input.loadedRefs?.length) {
    return segmentAllDescriptionsFromLoadedRefs(descriptions, input.loadedRefs);
  }
  return segmentAllDescriptions(
    descriptions,
    input.dictionary.tokens,
    input.dictionary.categories ?? [],
  );
}

function pathCategoriesForInput(input: CorpusSegmentationInput): TokenCategory[] {
  if (input.loadedRefs?.length) {
    return getPathOrderingCategories(input.loadedRefs);
  }
  return normalizeCategoryOrders(input.dictionary.categories ?? []);
}

function canonicalizeCorpusLeafPaths(
  leafPaths: string[],
  input: CorpusSegmentationInput,
): string[] {
  const pathCategories = pathCategoriesForInput(input);
  const canonical = input.loadedRefs?.length
    ? canonicalizeItemPathsFromLoadedRefs(leafPaths, input.loadedRefs)
    : canonicalizeItemPaths(leafPaths, pathCategories);
  // One corpus row = one catalog item; do not drop shorter paths that share a prefix with longer rows.
  return normalizeItemPaths(canonical, pathCategories);
}

/** Resolves leaf paths from pre-segmented rows, honoring right-column exclusions. */
export function resolveCorpusItemPathsFromRows(
  rows: RowSegmentation[],
  input: CorpusSegmentationInput,
): string[] {
  const adjustedRows = applyExclusionsToRows(rows, input.segmentExclusions, input.itemExclusions);
  const leafPaths = adjustedRows
    .map((row) => row.path.trim())
    .filter(Boolean);
  return canonicalizeCorpusLeafPaths(leafPaths, input);
}

/** Canonical leaf prestation paths for runtime catalog / export (live segmentation). */
export function resolveCorpusItemPaths(input: CorpusSegmentationInput): string[] {
  const { rows } = segmentCorpusDescriptions(input);
  return resolveCorpusItemPathsFromRows(rows, input);
}

/** Path → source description(s) from the latest segmentation pass. */
export function buildCorpusLeafDescriptionMap(
  input: CorpusSegmentationInput,
): Map<string, string> {
  const { rows } = segmentCorpusDescriptions(input);
  const adjustedRows = applyExclusionsToRows(rows, input.segmentExclusions, input.itemExclusions);
  return buildLeafDescriptionMap(adjustedRows);
}
