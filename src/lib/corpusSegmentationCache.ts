/**
 * Precomputes corpus row segmentations so tab switches do not re-run phrase matching per row.
 */
import type { TokenCategory } from './dictionaryTree';
import {
  buildTaggedMatchPhrases,
  segmentDescriptionMulti,
  type LoadedDictionaryRef,
  type MultiSegmentationResult,
} from './multiDictionarySegment';
import { segmentDescription, type TokenEntry } from './tokenDictionary';
import {
  buildLoadedRefsSegmentationRuntime,
  type LoadedRefsSegmentationRuntime,
} from './loadedRefsSegmentationRuntime';
import {
  sanitizeSegmentationEntry,
  sanitizeStringForPostgresJsonb,
} from './postgresJsonbStrings';

export type CorpusSegmentationEntry = Pick<MultiSegmentationResult, 'segments' | 'unmatched' | 'path'>;

/** Normalizes description text for cache keys (trim + PostgreSQL-safe). */
export function normalizeCorpusDescriptionText(text: string): string {
  return sanitizeStringForPostgresJsonb(text.trim());
}

const DEFAULT_CHUNK_YIELD_EVERY = 24;

/** Larger corpora yield less often to finish faster without blocking the UI. */
export function adaptiveCorpusSegmentationYieldEvery(uniqueTextCount: number): number {
  if (uniqueTextCount < 500) return DEFAULT_CHUNK_YIELD_EVERY;
  if (uniqueTextCount < 2_000) return 50;
  if (uniqueTextCount < 10_000) return 150;
  return 300;
}

/** Yields so React can paint progress before heavy work continues. */
export function yieldToMainThread(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

const SEGMENTATION_YIELD_MS = 200;
const SEGMENTATION_YIELD_BATCH = 150;

function segmentRow(
  text: string,
  loadedRefs: LoadedDictionaryRef[],
  fallbackTokens: TokenEntry[],
  fallbackCategories: TokenCategory[],
  runtime?: LoadedRefsSegmentationRuntime,
): CorpusSegmentationEntry {
  if (loadedRefs.length > 0) {
    const result = segmentDescriptionMulti(text, loadedRefs, runtime?.taggedPhrases, runtime);
    return sanitizeSegmentationEntry({
      segments: result.segments,
      unmatched: result.unmatched,
      path: result.path,
    });
  }

  const legacy = segmentDescription(text, fallbackTokens, fallbackCategories);
  return sanitizeSegmentationEntry({
    segments: legacy.segments.map((t) => ({ text: t, dictionaryId: '' })),
    unmatched: legacy.unmatched,
    path: legacy.path,
  });
}

/** Unique texts with priority items first (stable header order for the rest). */
export function orderUniqueCorpusTexts(texts: string[], priorityTexts: string[] = []): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  const push = (text: string) => {
    const trimmed = normalizeCorpusDescriptionText(text);
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    ordered.push(trimmed);
  };
  for (const text of priorityTexts) push(text);
  for (const text of texts) push(text);
  return ordered;
}

/** Builds a lookup table keyed by description text (rebuilt when dictionaries/tokens change). */
export function buildCorpusSegmentationCache(
  texts: string[],
  loadedRefs: LoadedDictionaryRef[],
  fallbackTokens: TokenEntry[],
  fallbackCategories: TokenCategory[],
  priorityTexts: string[] = [],
): Map<string, CorpusSegmentationEntry> {
  const cache = new Map<string, CorpusSegmentationEntry>();
  const runtime = loadedRefs.length > 0
    ? buildLoadedRefsSegmentationRuntime(loadedRefs, buildTaggedMatchPhrases(loadedRefs))
    : undefined;

  for (const text of orderUniqueCorpusTexts(texts, priorityTexts)) {
    cache.set(text, segmentRow(text, loadedRefs, fallbackTokens, fallbackCategories, runtime));
  }

  return cache;
}

export interface BuildCorpusSegmentationCacheAsyncOptions {
  yieldEvery?: number;
  shouldCancel?: () => boolean;
  existingCache?: Map<string, CorpusSegmentationEntry>;
  /** Called after each yield batch (and at completion). */
  onProgress?: (processed: number, total: number, cache: Map<string, CorpusSegmentationEntry>) => void;
}

/** Builds the full corpus cache, yielding to the browser between batches. */
export async function buildCorpusSegmentationCacheAsync(
  texts: string[],
  loadedRefs: LoadedDictionaryRef[],
  fallbackTokens: TokenEntry[],
  fallbackCategories: TokenCategory[],
  options?: BuildCorpusSegmentationCacheAsyncOptions,
): Promise<Map<string, CorpusSegmentationEntry>> {
  const cache = new Map(options?.existingCache ?? []);
  const taggedPhrases = loadedRefs.length > 0 ? buildTaggedMatchPhrases(loadedRefs) : undefined;
  const runtime = loadedRefs.length > 0
    ? buildLoadedRefsSegmentationRuntime(loadedRefs, taggedPhrases)
    : undefined;
  const workQueue = orderUniqueCorpusTexts(texts);
  let lastYield = typeof performance !== 'undefined' ? performance.now() : 0;
  const total = workQueue.length;

  let processedCount = 0;

  const reportProgress = () => {
    options?.onProgress?.(processedCount, total, cache);
  };

  reportProgress();
  await yieldToMainThread();

  for (const text of workQueue) {
    if (options?.shouldCancel?.()) return cache;
    if (cache.has(text)) {
      processedCount += 1;
      continue;
    }

    cache.set(text, segmentRow(text, loadedRefs, fallbackTokens, fallbackCategories, runtime));
    processedCount += 1;

    const now = typeof performance !== 'undefined' ? performance.now() : lastYield + SEGMENTATION_YIELD_MS;
    const shouldYield = processedCount <= 3
      || processedCount % SEGMENTATION_YIELD_BATCH === 0
      || now - lastYield >= SEGMENTATION_YIELD_MS;
    if (shouldYield) {
      lastYield = now;
      reportProgress();
      await yieldToMainThread();
    }
  }

  reportProgress();
  return cache;
}

export function lookupCorpusSegmentation(
  cache: Map<string, CorpusSegmentationEntry>,
  text: string,
): CorpusSegmentationEntry | undefined {
  return cache.get(normalizeCorpusDescriptionText(text));
}

/** Builds row segmentations from a precomputed cache (file order). */
export function rowsFromCorpusSegmentationCache(
  descriptions: readonly string[],
  cache: ReadonlyMap<string, CorpusSegmentationEntry>,
): Array<{
  rowIndex: number;
  sourceText: string;
  path: string;
  unmatched: string[];
}> {
  const rows: Array<{
    rowIndex: number;
    sourceText: string;
    path: string;
    unmatched: string[];
  }> = [];

  descriptions.forEach((sourceText, rowIndex) => {
    const trimmed = normalizeCorpusDescriptionText(sourceText);
    if (!trimmed) return;
    const entry = cache.get(trimmed);
    if (!entry?.path) return;
    rows.push({
      rowIndex,
      sourceText: trimmed,
      path: entry.path,
      unmatched: entry.unmatched,
    });
  });

  return rows;
}
