/**
 * Builds corpus segmentation cache during idle time to avoid blocking tab switches.
 */
import { useEffect, useMemo, useState } from 'react';
import { segmentationCategorySignature, type TokenCategory } from '../lib/dictionaryTree';
import {
  buildCorpusSegmentationCacheAsync,
  lookupCorpusSegmentation,
  type CorpusSegmentationEntry,
} from '../lib/corpusSegmentationCache';
import type { LoadedDictionaryRef } from '../lib/multiDictionarySegment';
import type { TokenEntry } from '../lib/tokenDictionary';

function loadedRefsSignature(loadedRefs: LoadedDictionaryRef[]): string {
  return loadedRefs
    .map((r) => `${r.dictionary.id}:${r.dictionary.tokens.length}:${segmentationCategorySignature(r.dictionary.categories ?? [])}`)
    .join('|');
}

export interface UseSegmentationCacheOptions {
  /** When false, keeps the last cache and skips rebuild (e.g. ontology tab hidden). */
  enabled?: boolean;
}

export function useSegmentationCache(
  texts: string[],
  loadedRefs: LoadedDictionaryRef[],
  fallbackTokens: TokenEntry[],
  fallbackCategories: TokenCategory[],
  options?: UseSegmentationCacheOptions,
): Map<string, CorpusSegmentationEntry> {
  const enabled = options?.enabled ?? true;
  const [cache, setCache] = useState<Map<string, CorpusSegmentationEntry>>(() => new Map());

  const signature = useMemo(
    () => [
      texts.length,
      texts[0] ?? '',
      texts[texts.length - 1] ?? '',
      loadedRefsSignature(loadedRefs),
      fallbackTokens.length,
      segmentationCategorySignature(fallbackCategories),
    ].join('\0'),
    [texts, loadedRefs, fallbackTokens.length, fallbackCategories],
  );

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const build = async () => {
      const next = await buildCorpusSegmentationCacheAsync(
        texts,
        loadedRefs,
        fallbackTokens,
        fallbackCategories,
        { shouldCancel: () => cancelled },
      );
      if (!cancelled) setCache(next);
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const id = window.requestIdleCallback(() => void build(), { timeout: 800 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(id);
      };
    }

    void build();
    return () => {
      cancelled = true;
    };
  // Rebuild only when segmentation inputs change (signature), not on every categories array reference.
  }, [enabled, signature]);

  return cache;
}

export { lookupCorpusSegmentation };
