/**
 * Builds corpus Glide rows from persisted segmentation cache (instant chip paints).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { TokenCategory } from '../../../lib/dictionaryTree';
import type { LoadedDictionaryRef } from '../../../lib/multiDictionarySegment';
import type { CorpusSegmentationEntry } from '../../../lib/corpusSegmentationCache';
import { normalizeCorpusDescriptionText } from '../../../lib/corpusSegmentationCache';
import type { CorpusRow } from '../corpusRowModel';
import {
  buildCorpusGlideRowMap,
  buildCorpusGlideRowsFromCache,
  type CorpusGlideRow,
} from './buildCorpusGlideRows';

const BUILD_CHUNK_SIZE = 800;

export interface UseCorpusGlideRowsResult {
  glideRowMap: ReadonlyMap<number, CorpusGlideRow>;
  building: boolean;
  buildProgress: { processed: number; total: number };
}

export function useCorpusGlideRows(
  allRows: readonly CorpusRow[],
  segmentationCache: ReadonlyMap<string, CorpusSegmentationEntry>,
  loadedRefs: LoadedDictionaryRef[],
  editingDictionaryId: string | null,
  categories: TokenCategory[],
  cacheReady: boolean,
): UseCorpusGlideRowsResult {
  const [glideRows, setGlideRows] = useState<CorpusGlideRow[]>([]);
  const [building, setBuilding] = useState(false);
  const [buildProgress, setBuildProgress] = useState({ processed: 0, total: 0 });

  const cacheSize = segmentationCache.size;
  const cacheRef = useRef(segmentationCache);
  cacheRef.current = segmentationCache;

  const loadedRefsKey = useMemo(
    () => loadedRefs.map((r) => r.dictionary.id).join('|'),
    [loadedRefs],
  );

  useEffect(() => {
    if (!cacheReady) {
      setGlideRows([]);
      setBuilding(false);
      setBuildProgress({ processed: 0, total: 0 });
      return undefined;
    }

    let cancelled = false;
    setBuilding(allRows.length > BUILD_CHUNK_SIZE);
    setBuildProgress({ processed: 0, total: allRows.length });

    const lookupRef = (text: string) =>
      cacheRef.current.get(normalizeCorpusDescriptionText(text));

    const finish = (built: CorpusGlideRow[]) => {
      if (!cancelled) {
        setGlideRows(built);
        setBuilding(false);
        setBuildProgress({ processed: allRows.length, total: allRows.length });
      }
    };

    if (allRows.length <= BUILD_CHUNK_SIZE) {
      finish(buildCorpusGlideRowsFromCache(
        allRows,
        lookupRef,
        loadedRefs,
        editingDictionaryId,
        categories,
        new Map(),
      ));
      return () => {
        cancelled = true;
      };
    }

    setGlideRows([]);
    const built: CorpusGlideRow[] = [];
    let index = 0;

    const processChunk = () => {
      if (cancelled) return;
      const end = Math.min(index + BUILD_CHUNK_SIZE, allRows.length);
      const slice = allRows.slice(index, end);
      built.push(...buildCorpusGlideRowsFromCache(
        slice,
        lookupRef,
        loadedRefs,
        editingDictionaryId,
        categories,
        new Map(),
      ));
      index = end;
      setBuildProgress({ processed: index, total: allRows.length });

      if (index < allRows.length) {
        requestAnimationFrame(processChunk);
      } else {
        finish(built);
      }
    };

    requestAnimationFrame(processChunk);

    return () => {
      cancelled = true;
    };
  }, [
    cacheReady,
    allRows,
    cacheSize,
    loadedRefsKey,
    editingDictionaryId,
    categories,
  ]);

  const glideRowMap = useMemo(
    () => (cacheReady && glideRows.length > 0 && !building
      ? buildCorpusGlideRowMap(glideRows)
      : new Map<number, CorpusGlideRow>()),
    [cacheReady, glideRows, building],
  );

  return { glideRowMap, building, buildProgress };
}
