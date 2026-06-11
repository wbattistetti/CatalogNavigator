/**
 * Precomputes corpus row segmentations so tab switches do not re-run phrase matching per row.
 */
import type { TokenCategory } from './dictionaryTree';
import type { LoadedDictionaryRef, MultiSegmentationResult } from './multiDictionarySegment';
import { segmentDescriptionMulti } from './multiDictionarySegment';
import { segmentDescription, type TokenEntry } from './tokenDictionary';

export type CorpusSegmentationEntry = Pick<MultiSegmentationResult, 'segments' | 'unmatched'>;

const DEFAULT_CHUNK_YIELD_EVERY = 24;

function segmentRow(
  text: string,
  loadedRefs: LoadedDictionaryRef[],
  fallbackTokens: TokenEntry[],
  fallbackCategories: TokenCategory[],
): CorpusSegmentationEntry {
  if (loadedRefs.length > 0) {
    const result = segmentDescriptionMulti(text, loadedRefs);
    return { segments: result.segments, unmatched: result.unmatched };
  }

  const legacy = segmentDescription(text, fallbackTokens, fallbackCategories);
  return {
    segments: legacy.segments.map((t) => ({ text: t, dictionaryId: '' })),
    unmatched: legacy.unmatched,
  };
}

/** Builds a lookup table keyed by description text (rebuilt when dictionaries/tokens change). */
export function buildCorpusSegmentationCache(
  texts: string[],
  loadedRefs: LoadedDictionaryRef[],
  fallbackTokens: TokenEntry[],
  fallbackCategories: TokenCategory[],
): Map<string, CorpusSegmentationEntry> {
  const cache = new Map<string, CorpusSegmentationEntry>();

  for (const text of texts) {
    if (cache.has(text)) continue;
    cache.set(text, segmentRow(text, loadedRefs, fallbackTokens, fallbackCategories));
  }

  return cache;
}

/** Yields to the browser between chunks so category edits stay instant. */
export async function buildCorpusSegmentationCacheAsync(
  texts: string[],
  loadedRefs: LoadedDictionaryRef[],
  fallbackTokens: TokenEntry[],
  fallbackCategories: TokenCategory[],
  options?: {
    yieldEvery?: number;
    shouldCancel?: () => boolean;
  },
): Promise<Map<string, CorpusSegmentationEntry>> {
  const cache = new Map<string, CorpusSegmentationEntry>();
  const yieldEvery = options?.yieldEvery ?? DEFAULT_CHUNK_YIELD_EVERY;
  let sinceYield = 0;

  for (const text of texts) {
    if (options?.shouldCancel?.()) return cache;
    if (cache.has(text)) continue;

    cache.set(text, segmentRow(text, loadedRefs, fallbackTokens, fallbackCategories));
    sinceYield += 1;

    if (sinceYield >= yieldEvery) {
      sinceYield = 0;
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    }
  }

  return cache;
}

export function lookupCorpusSegmentation(
  cache: Map<string, CorpusSegmentationEntry>,
  text: string,
): CorpusSegmentationEntry {
  return cache.get(text) ?? { segments: [], unmatched: [] };
}
