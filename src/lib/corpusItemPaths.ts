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
import {
  applyExtraAnnotationsToRows,
  type CorpusExtraAnnotations,
} from './corpusExtraAnnotations';

export type { CorpusSegmentExclusions, CorpusItemExclusions };
import {
  yieldToMainThread,
  type CorpusSegmentationEntry,
} from './corpusSegmentationCache';
import {
  buildLeafDescriptionMap,
  segmentAllDescriptions,
  type RowSegmentation,
  type TokenDictionary,
} from './tokenDictionary';

export interface CorpusSegmentationInput {
  descriptions: string[];
  dictionary: TokenDictionary;
  loadedRefs?: LoadedDictionaryRef[];
  /** Right-column manual segment removals (authoritative for compile). */
  segmentExclusions?: CorpusSegmentExclusions;
  /** Whole corpus rows omitted from catalog compile. */
  itemExclusions?: CorpusItemExclusions;
  /** Per-row extra column tokens merged into paths. */
  extraAnnotations?: CorpusExtraAnnotations;
}

export function buildCorpusSegmentationInputFromLoadedRefs(
  descriptions: string[],
  loadedRefs: LoadedDictionaryRef[],
  segmentExclusions?: CorpusSegmentExclusions,
  itemExclusions?: CorpusItemExclusions,
  extraAnnotations?: CorpusExtraAnnotations,
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
    extraAnnotations,
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
  const excluded = applyExclusionsToRows(rows, input.segmentExclusions, input.itemExclusions);
  const adjustedRows = applyExtraAnnotationsToRows(excluded, input.extraAnnotations);
  const leafPaths = adjustedRows
    .map((row) => row.path.trim())
    .filter(Boolean);
  return canonicalizeCorpusLeafPaths(leafPaths, input);
}

/** Resolves leaf paths from a warmed corpus segmentation cache (no live re-segmentation). */
export function resolveCorpusItemPathsFromSegmentationCache(
  input: CorpusSegmentationInput,
  cache: ReadonlyMap<string, CorpusSegmentationEntry>,
): string[] {
  return resolveCorpusItemPathsFromRows(rowsFromSegmentationCache(cache), input);
}

const PATH_RESOLVE_YIELD_EVERY = 400;

function rowsFromSegmentationCache(
  cache: ReadonlyMap<string, CorpusSegmentationEntry>,
): RowSegmentation[] {
  const rows: RowSegmentation[] = [];
  for (const [text, entry] of cache.entries()) {
    if (!entry?.path?.trim()) continue;
    rows.push({
      rowIndex: rows.length,
      sourceText: text,
      path: entry.path,
      unmatched: entry.unmatched ?? [],
    });
  }
  return rows;
}

/**
 * Async path resolution from segmentation cache — yields so the UI stays responsive.
 */
export async function resolveCorpusItemPathsFromSegmentationCacheAsync(
  input: CorpusSegmentationInput,
  cache: ReadonlyMap<string, CorpusSegmentationEntry>,
  onProgress?: (processed: number, total: number) => void,
): Promise<string[]> {
  const rows = rowsFromSegmentationCache(cache);
  const total = rows.length;
  let processed = 0;

  for (let i = 0; i < rows.length; i += PATH_RESOLVE_YIELD_EVERY) {
    processed = Math.min(i + PATH_RESOLVE_YIELD_EVERY, total);
    onProgress?.(processed, total);
    await yieldToMainThread();
  }

  onProgress?.(total, total);
  await yieldToMainThread();
  return resolveCorpusItemPathsFromRows(rows, input);
}

/** Canonical leaf prestation paths for runtime catalog / export (live segmentation). */
export function resolveCorpusItemPaths(input: CorpusSegmentationInput): string[] {
  const { rows } = segmentCorpusDescriptions(input);
  return resolveCorpusItemPathsFromRows(rows, input);
}

/** Segmented corpus rows after item/segment exclusions (one row per document line). */
export function resolveCorpusSegmentationRows(input: CorpusSegmentationInput): RowSegmentation[] {
  const { rows } = segmentCorpusDescriptions(input);
  return applyExclusionsToRows(rows, input.segmentExclusions, input.itemExclusions);
}

/** Path → source description(s) from the latest segmentation pass. */
export function buildCorpusLeafDescriptionMap(
  input: CorpusSegmentationInput,
): Map<string, string> {
  const { rows } = segmentCorpusDescriptions(input);
  const adjustedRows = applyExclusionsToRows(rows, input.segmentExclusions, input.itemExclusions);
  return buildLeafDescriptionMap(adjustedRows);
}
