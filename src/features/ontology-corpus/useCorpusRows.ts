/**
 * Corpus row list with optional description filter (view-only; does not affect segmentation).
 */
import { useEffect, useMemo } from 'react';
import {
  buildCorpusRows,
  corpusFilterStats,
  filterCorpusRows,
  type CorpusFilterStats,
  type CorpusRow,
} from './corpusRowModel';
import type { CorpusDescriptionFilter } from './useCorpusDescriptionFilter';

export interface UseCorpusRowsResult {
  allRows: CorpusRow[];
  visibleRows: CorpusRow[];
  filterStats: CorpusFilterStats;
}

export function useCorpusRows(
  descriptions: string[],
  filter: CorpusDescriptionFilter,
  onFilterStatsChange?: (stats: CorpusFilterStats) => void,
): UseCorpusRowsResult {
  const allRows = useMemo(() => buildCorpusRows(descriptions), [descriptions]);

  const visibleRows = useMemo(
    () => filterCorpusRows(allRows, filter.applied),
    [allRows, filter.applied],
  );

  const filterStats = useMemo(
    () => corpusFilterStats(visibleRows.length, allRows.length, filter.isActive),
    [visibleRows.length, allRows.length, filter.isActive],
  );

  useEffect(() => {
    onFilterStatsChange?.(filterStats);
  }, [filterStats, onFilterStatsChange]);

  return { allRows, visibleRows, filterStats };
}
