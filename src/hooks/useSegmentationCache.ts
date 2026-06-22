/**
 * Builds the full corpus segmentation cache once per corpus/dictionary signature.
 * Yields on the main thread during build but commits a single React update when done.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { TokenCategory } from '../lib/dictionaryTree';
import {
  buildCorpusSegmentationCacheAsync,
  lookupCorpusSegmentation,
  orderUniqueCorpusTexts,
  type CorpusSegmentationEntry,
} from '../lib/corpusSegmentationCache';
import { buildTaggedMatchPhrases, type LoadedDictionaryRef } from '../lib/multiDictionarySegment';
import {
  corpusSegmentationCacheSignature,
  loadedRefsSegmentationSignature,
} from '../features/ontology-corpus/corpusSegmentationSignature';

export interface SegmentationCacheProgress {
  processed: number;
  total: number;
  ready: boolean;
}

export interface UseSegmentationCacheOptions {
  /** When false, keeps the last cache and skips rebuild (e.g. ontology tab hidden). */
  enabled?: boolean;
}

export interface UseSegmentationCacheResult {
  cache: Map<string, CorpusSegmentationEntry>;
  progress: SegmentationCacheProgress;
  matchPhrases: ReturnType<typeof buildTaggedMatchPhrases>;
}

export function useSegmentationCache(
  texts: string[],
  loadedRefs: LoadedDictionaryRef[],
  fallbackCategories: TokenCategory[],
  options?: UseSegmentationCacheOptions,
): UseSegmentationCacheResult {
  const enabled = options?.enabled ?? true;
  const [cache, setCache] = useState<Map<string, CorpusSegmentationEntry>>(() => new Map());
  const [progress, setProgress] = useState<SegmentationCacheProgress>({
    processed: 0,
    total: 0,
    ready: false,
  });

  const textsRef = useRef(texts);
  textsRef.current = texts;

  const refsSignature = useMemo(
    () => loadedRefsSegmentationSignature(loadedRefs),
    [loadedRefs],
  );

  const matchPhrases = useMemo(
    () => (loadedRefs.length > 0 ? buildTaggedMatchPhrases(loadedRefs) : []),
    [loadedRefs, refsSignature],
  );

  const signature = useMemo(
    () => corpusSegmentationCacheSignature(texts, loadedRefs, fallbackCategories),
    [texts, loadedRefs, fallbackCategories],
  );

  useEffect(() => {
    if (!enabled) return;

    const corpusTexts = textsRef.current;
    const uniqueTotal = orderUniqueCorpusTexts(corpusTexts).length;

    let cancelled = false;
    setCache(new Map());
    setProgress({ processed: 0, total: uniqueTotal, ready: false });

    const build = async () => {
      const result = await buildCorpusSegmentationCacheAsync(
        corpusTexts,
        loadedRefs,
        [],
        fallbackCategories,
        {
          shouldCancel: () => cancelled,
          onProgress: (processed, total) => {
            if (!cancelled) {
              setProgress({ processed, total, ready: false });
            }
          },
        },
      );

      if (cancelled) return;

      setCache(result);
      setProgress({
        processed: uniqueTotal,
        total: uniqueTotal,
        ready: true,
      });
    };

    void build();
    return () => {
      cancelled = true;
    };
  }, [enabled, signature, loadedRefs, fallbackCategories]);

  return { cache, progress, matchPhrases };
}

export { lookupCorpusSegmentation };
