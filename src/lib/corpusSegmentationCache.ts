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

export type CorpusSegmentationEntry = Pick<MultiSegmentationResult, 'segments' | 'unmatched' | 'path'>;

const DEFAULT_CHUNK_YIELD_EVERY = 24;

type TaggedPhrases = ReturnType<typeof buildTaggedMatchPhrases>;

function segmentRow(
  text: string,
  loadedRefs: LoadedDictionaryRef[],
  fallbackTokens: TokenEntry[],
  fallbackCategories: TokenCategory[],
  prebuiltPhrases?: TaggedPhrases,
): CorpusSegmentationEntry {
  if (loadedRefs.length > 0) {
    const result = segmentDescriptionMulti(text, loadedRefs, prebuiltPhrases);
    return { segments: result.segments, unmatched: result.unmatched, path: result.path };
  }

  const legacy = segmentDescription(text, fallbackTokens, fallbackCategories);
  return {
    segments: legacy.segments.map((t) => ({ text: t, dictionaryId: '' })),
    unmatched: legacy.unmatched,
    path: legacy.path,
  };
}

/** Unique texts with priority items first (stable header order for the rest). */
export function orderUniqueCorpusTexts(texts: string[], priorityTexts: string[] = []): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  const push = (text: string) => {
    const trimmed = text.trim();
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
  const phrases = loadedRefs.length > 0 ? buildTaggedMatchPhrases(loadedRefs) : undefined;

  for (const text of orderUniqueCorpusTexts(texts, priorityTexts)) {
    cache.set(text, segmentRow(text, loadedRefs, fallbackTokens, fallbackCategories, phrases));
  }

  return cache;
}

export interface BuildCorpusSegmentationCacheAsyncOptions {
  yieldEvery?: number;
  shouldCancel?: () => boolean;
  priorityTexts?: string[];
  /** Called during scroll to prepend uncached visible rows to the work queue. */
  getPriorityTexts?: () => string[];
  existingCache?: Map<string, CorpusSegmentationEntry>;
  onChunk?: (
    cache: Map<string, CorpusSegmentationEntry>,
    processed: number,
    total: number,
  ) => void;
}

/** Yields to the browser between chunks; updates cache incrementally via onChunk. */
export async function buildCorpusSegmentationCacheAsync(
  texts: string[],
  loadedRefs: LoadedDictionaryRef[],
  fallbackTokens: TokenEntry[],
  fallbackCategories: TokenCategory[],
  options?: BuildCorpusSegmentationCacheAsyncOptions,
): Promise<Map<string, CorpusSegmentationEntry>> {
  const cache = new Map(options?.existingCache ?? []);
  const phrases = loadedRefs.length > 0 ? buildTaggedMatchPhrases(loadedRefs) : undefined;
  const yieldEvery = options?.yieldEvery ?? DEFAULT_CHUNK_YIELD_EVERY;
  const workQueue = orderUniqueCorpusTexts(texts, options?.priorityTexts ?? []);
  const total = workQueue.length;
  let queueIndex = 0;
  let sinceYield = 0;

  const prependUncachedPriority = () => {
    const priority = options?.getPriorityTexts?.() ?? [];
    for (let i = priority.length - 1; i >= 0; i--) {
      const text = priority[i]!.trim();
      if (!text || cache.has(text)) continue;
      if (workQueue.includes(text)) {
        const existingIndex = workQueue.indexOf(text);
        if (existingIndex > queueIndex) {
          workQueue.splice(existingIndex, 1);
          workQueue.splice(queueIndex, 0, text);
        }
        continue;
      }
      workQueue.splice(queueIndex, 0, text);
    }
  };

  options?.onChunk?.(new Map(cache), cache.size, total);
  prependUncachedPriority();

  while (queueIndex < workQueue.length) {
    if (options?.shouldCancel?.()) return cache;

    prependUncachedPriority();

    const text = workQueue[queueIndex]!;
    queueIndex += 1;
    if (cache.has(text)) continue;

    cache.set(text, segmentRow(text, loadedRefs, fallbackTokens, fallbackCategories, phrases));
    sinceYield += 1;

    if (sinceYield >= yieldEvery) {
      sinceYield = 0;
      options?.onChunk?.(new Map(cache), cache.size, total);
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    }
  }

  options?.onChunk?.(new Map(cache), cache.size, total);
  return cache;
}

export function lookupCorpusSegmentation(
  cache: Map<string, CorpusSegmentationEntry>,
  text: string,
): CorpusSegmentationEntry | undefined {
  return cache.get(text.trim());
}
