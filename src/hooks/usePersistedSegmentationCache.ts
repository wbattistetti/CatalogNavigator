/**
 * Corpus segmentation with Supabase persistence and signature-based invalidation.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TokenCategory } from '../lib/dictionaryTree';
import {
  buildCorpusSegmentationCacheAsync,
  lookupCorpusSegmentation,
  orderUniqueCorpusTexts,
  yieldToMainThread,
  type CorpusSegmentationEntry,
} from '../lib/corpusSegmentationCache';
import {
  corpusSegmentationCacheFromEntries,
  countPersistedSegmentationEntries,
  deletePersistedCorpusSegmentation,
  isPersistedSegmentationComplete,
  loadPersistedCorpusSegmentation,
  type PersistedCorpusSegmentation,
  savePersistedCorpusSegmentation,
} from '../lib/persistCorpusSegmentation';
import { buildTaggedMatchPhrases, type LoadedDictionaryRef } from '../lib/multiDictionarySegment';
import {
  corpusSegmentationCacheSignature,
  loadedRefsSegmentationSignature,
} from '../features/ontology-corpus/corpusSegmentationSignature';

export interface SegmentationCacheProgress {
  processed: number;
  total: number;
  ready: boolean;
  /** Active step when `building` is true. */
  phase: 'segmenting' | 'saving';
}

export interface UsePersistedSegmentationCacheOptions {
  /** When false, skips load/build (no tabular ontology). */
  enabled?: boolean;
  /** When false, dictionary/corpus layout may still be loading — defer invalidation. */
  layoutStable?: boolean;
}

export type CorpusSegmentationBuildMode = 'resume' | 'fresh';

export interface BuildCorpusSegmentationOptions {
  mode?: CorpusSegmentationBuildMode;
  onProgress?: (processed: number, total: number) => void;
  shouldCancel?: () => boolean;
}

export interface UsePersistedSegmentationCacheResult {
  cache: Map<string, CorpusSegmentationEntry>;
  progress: SegmentationCacheProgress;
  matchPhrases: ReturnType<typeof buildTaggedMatchPhrases>;
  loadingPersisted: boolean;
  building: boolean;
  /** Saved signature differs from current corpus + dictionary layout. */
  stale: boolean;
  /** True while linked dictionaries / sessions are still settling after reopen. */
  layoutStabilizing: boolean;
  /** Partial segmentation saved for the current layout (can resume). */
  partialSegmentationAvailable: boolean;
  currentSignature: string;
  buildCorpusSegmentation: (options?: BuildCorpusSegmentationOptions) => Promise<{
    cache: Map<string, CorpusSegmentationEntry>;
    cancelled: boolean;
  }>;
  cancelBuild: () => void;
  persistError: string | null;
  dismissPersistError: () => void;
}

function resolveStartingCache(
  mode: CorpusSegmentationBuildMode,
  inMemoryCache: Map<string, CorpusSegmentationEntry>,
  persistedRow: PersistedCorpusSegmentation | null,
  currentSignature: string,
): Map<string, CorpusSegmentationEntry> {
  if (mode === 'fresh') return new Map();

  if (inMemoryCache.size > 0) return new Map(inMemoryCache);

  if (persistedRow?.signature === currentSignature) {
    return corpusSegmentationCacheFromEntries(persistedRow.entries);
  }

  return new Map();
}

export function usePersistedSegmentationCache(
  documentId: string,
  texts: string[],
  loadedRefs: LoadedDictionaryRef[],
  fallbackCategories: TokenCategory[],
  options?: UsePersistedSegmentationCacheOptions,
): UsePersistedSegmentationCacheResult {
  const enabled = options?.enabled ?? true;
  const layoutStable = options?.layoutStable ?? true;
  const [cache, setCache] = useState<Map<string, CorpusSegmentationEntry>>(() => new Map());
  const [progress, setProgress] = useState<SegmentationCacheProgress>({
    processed: 0,
    total: 0,
    ready: false,
    phase: 'segmenting',
  });
  const [loadingPersisted, setLoadingPersisted] = useState(false);
  const [building, setBuilding] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);
  const [persistedRow, setPersistedRow] = useState<PersistedCorpusSegmentation | null>(null);

  const textsRef = useRef(texts);
  textsRef.current = texts;
  const cancelBuildRef = useRef(false);
  const cacheRef = useRef(cache);
  cacheRef.current = cache;
  const persistedRowRef = useRef(persistedRow);
  persistedRowRef.current = persistedRow;

  const refsSignature = useMemo(
    () => loadedRefsSegmentationSignature(loadedRefs),
    [loadedRefs],
  );

  const matchPhrases = useMemo(
    () => (loadedRefs.length > 0 ? buildTaggedMatchPhrases(loadedRefs) : []),
    [loadedRefs, refsSignature],
  );

  const currentSignature = useMemo(
    () => corpusSegmentationCacheSignature(texts, loadedRefs, fallbackCategories),
    [texts, loadedRefs, fallbackCategories],
  );

  const uniqueTextCount = useMemo(
    () => orderUniqueCorpusTexts(texts).length,
    [texts],
  );

  const stale = layoutStable
    && !loadingPersisted
    && persistedRow !== null
    && persistedRow.signature !== currentSignature;

  const layoutStabilizing = enabled && !layoutStable;

  const partialSegmentationAvailable = useMemo(() => {
    if (uniqueTextCount === 0 || progress.ready || building) return false;

    const persistedCount = persistedRow?.signature === currentSignature
      ? countPersistedSegmentationEntries(persistedRow)
      : 0;
    const effectiveCount = Math.max(cache.size, persistedCount);
    return effectiveCount > 0 && !isPersistedSegmentationComplete(effectiveCount, uniqueTextCount);
  }, [
    uniqueTextCount,
    progress.ready,
    building,
    persistedRow,
    currentSignature,
    cache.size,
  ]);

  // Reset only when switching documents — not when dictionaries briefly unload.
  useEffect(() => {
    setPersistedRow(null);
    setCache(new Map());
    setProgress({ processed: 0, total: 0, ready: false, phase: 'segmenting' });
    setPersistError(null);
  }, [documentId]);

  // Load persisted row once per document while segmentation is enabled.
  useEffect(() => {
    if (!enabled) {
      setLoadingPersisted(false);
      return undefined;
    }

    let cancelled = false;
    setLoadingPersisted(true);

    void loadPersistedCorpusSegmentation(documentId)
      .then((row) => {
        if (!cancelled) setPersistedRow(row);
      })
      .catch(() => {
        if (!cancelled) setPersistedRow(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingPersisted(false);
      });

    return () => {
      cancelled = true;
    };
  }, [documentId, enabled]);

  // Hydrate in-memory cache when persisted signature matches current layout.
  useEffect(() => {
    if (!enabled || loadingPersisted || building) return;

    if (!layoutStable) {
      if (persistedRow && persistedRow.entries.length > 0) {
        const hydrated = corpusSegmentationCacheFromEntries(persistedRow.entries);
        const entryCount = hydrated.size;
        if (entryCount > 0) {
          const signatureMatches = persistedRow.signature === currentSignature;
          setCache(hydrated);
          setProgress({
            processed: entryCount,
            total: uniqueTextCount,
            ready: signatureMatches
              ? isPersistedSegmentationComplete(entryCount, uniqueTextCount)
              : true,
            phase: 'segmenting',
          });
        }
      }
      return;
    }

    if (persistedRow && persistedRow.signature === currentSignature) {
      const hydrated = corpusSegmentationCacheFromEntries(persistedRow.entries);
      const entryCount = hydrated.size;
      const isComplete = isPersistedSegmentationComplete(entryCount, uniqueTextCount);
      setCache(hydrated);
      setProgress({
        processed: entryCount,
        total: uniqueTextCount,
        ready: isComplete,
        phase: 'segmenting',
      });
      return;
    }

    // Layout drifted — still show last saved segmentation until the user refreshes.
    if (persistedRow && persistedRow.entries.length > 0) {
      const hydrated = corpusSegmentationCacheFromEntries(persistedRow.entries);
      const entryCount = hydrated.size;
      if (entryCount > 0) {
        setCache(hydrated);
        setProgress({
          processed: entryCount,
          total: uniqueTextCount,
          ready: true,
          phase: 'segmenting',
        });
        return;
      }
    }

    // Keep a complete in-memory build even if signature drifted before DB row caught up.
    if (progress.ready && cache.size > 0) return;

    // Keep unsaved partial for the current layout (failed save or interrupted persist).
    if (!progress.ready && cache.size > 0) {
      setProgress({
        processed: cache.size,
        total: uniqueTextCount,
        ready: false,
        phase: 'segmenting',
      });
      return;
    }

    setCache(new Map());
    setProgress({ processed: 0, total: uniqueTextCount, ready: false, phase: 'segmenting' });
  }, [
    enabled,
    layoutStable,
    loadingPersisted,
    building,
    persistedRow,
    currentSignature,
    uniqueTextCount,
    progress.ready,
    cache.size,
  ]);

  const cancelBuild = useCallback(() => {
    cancelBuildRef.current = true;
  }, []);

  const buildCorpusSegmentation = useCallback(async (
    buildOptions?: BuildCorpusSegmentationOptions,
  ): Promise<{ cache: Map<string, CorpusSegmentationEntry>; cancelled: boolean }> => {
    const corpusTexts = textsRef.current;
    const uniqueTotal = orderUniqueCorpusTexts(corpusTexts).length;
    const mode = buildOptions?.mode ?? 'fresh';
    const signature = corpusSegmentationCacheSignature(
      corpusTexts,
      loadedRefs,
      fallbackCategories,
    );

    cancelBuildRef.current = false;
    setBuilding(true);
    setPersistError(null);

    let startingCache = resolveStartingCache(
      mode,
      cacheRef.current,
      persistedRowRef.current,
      signature,
    );

    if (mode === 'fresh') {
      await deletePersistedCorpusSegmentation(documentId);
      setPersistedRow(null);
      startingCache = new Map();
      setCache(new Map());
    }

    setProgress({
      processed: startingCache.size,
      total: uniqueTotal,
      ready: false,
      phase: 'segmenting',
    });
    await yieldToMainThread();

    const shouldCancel = () => cancelBuildRef.current || buildOptions?.shouldCancel?.() === true;

    const applyInMemoryResult = (
      result: Map<string, CorpusSegmentationEntry>,
    ) => {
      const isComplete = isPersistedSegmentationComplete(result.size, uniqueTotal);
      setCache(result);
      setProgress({
        processed: result.size,
        total: uniqueTotal,
        ready: isComplete,
        phase: 'segmenting',
      });
    };

    const persistToSupabase = async (result: Map<string, CorpusSegmentationEntry>) => {
      setProgress((prev) => ({ ...prev, phase: 'saving' }));
      await yieldToMainThread();
      await savePersistedCorpusSegmentation(documentId, signature, result);
      setPersistedRow({
        documentId,
        signature,
        uniqueTextCount: result.size,
        entries: Object.fromEntries(result.entries()),
        builtAt: new Date().toISOString(),
      });
    };

    try {
      const result = await buildCorpusSegmentationCacheAsync(
        corpusTexts,
        loadedRefs,
        [],
        fallbackCategories,
        {
          existingCache: startingCache,
          shouldCancel,
          onProgress: (processed, total) => {
            setProgress({ processed, total, ready: false, phase: 'segmenting' });
            buildOptions?.onProgress?.(processed, total);
          },
        },
      );

      applyInMemoryResult(result);

      if (shouldCancel()) {
        if (result.size > 0) {
          try {
            await persistToSupabase(result);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setPersistError(message);
          }
        }
        return { cache: result, cancelled: true };
      }

      try {
        await persistToSupabase(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setPersistError(message);
      }
      return { cache: result, cancelled: false };
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err));
    } finally {
      setBuilding(false);
      cancelBuildRef.current = false;
    }
  }, [documentId, loadedRefs, fallbackCategories]);

  const dismissPersistError = useCallback(() => {
    setPersistError(null);
  }, []);

  return {
    cache,
    progress,
    matchPhrases,
    loadingPersisted,
    building,
    stale,
    layoutStabilizing,
    partialSegmentationAvailable,
    currentSignature,
    buildCorpusSegmentation,
    cancelBuild,
    persistError,
    dismissPersistError,
  };
}

export { lookupCorpusSegmentation };
