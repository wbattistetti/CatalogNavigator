/**
 * Builds corpus segmentation cache during idle time to avoid blocking tab switches.
 * Updates incrementally and prioritizes viewport-visible rows while scrolling.
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
  /** Description texts currently visible — segmented before the rest of the corpus. */
  priorityTexts?: string[];
  /** Live priority list (e.g. viewport rows) without cache invalidation. */
  getPriorityTexts?: () => string[];
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

  const priorityRef = useRef<string[]>([]);
  priorityRef.current = options?.priorityTexts ?? [];

  const getPriorityTexts = options?.getPriorityTexts;

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
      await buildCorpusSegmentationCacheAsync(
        corpusTexts,
        loadedRefs,
        [],
        fallbackCategories,
        {
          shouldCancel: () => cancelled,
          priorityTexts: getPriorityTexts?.() ?? priorityRef.current,
          getPriorityTexts: () => getPriorityTexts?.() ?? priorityRef.current,
          onChunk: (partial, processed, total) => {
            if (cancelled) return;
            setCache(partial);
            setProgress({
              processed,
              total: Math.max(total, uniqueTotal),
              ready: false,
            });
          },
        },
      );

      if (!cancelled) {
        setProgress({
          processed: uniqueTotal,
          total: uniqueTotal,
          ready: true,
        });
      }
    };

    void build();
    return () => {
      cancelled = true;
    };
  }, [enabled, signature, loadedRefs, fallbackCategories]);

  return { cache, progress, matchPhrases };
}

export { lookupCorpusSegmentation };