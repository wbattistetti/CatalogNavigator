/**
 * Types for the isolated Glide + segmentation benchmark page.
 */
import type { CorpusSegmentationEntry } from '../../lib/corpusSegmentationCache';

export const GLIDE_BENCH_SEG_CELL = 'glide-bench-seg' as const;

export interface GlideBenchSegPaint {
  text: string;
  bgColor: string;
  borderColor: string;
  fgColor: string;
}

export interface GlideBenchSegCellData {
  type: typeof GLIDE_BENCH_SEG_CELL;
  sourceText: string;
  segments: GlideBenchSegPaint[];
  unmatched: string[];
}

export interface GlideBenchRow {
  sourceIndex: number;
  description: string;
  segmentation: CorpusSegmentationEntry;
  paints: GlideBenchSegPaint[];
}

export const GLIDE_BENCH_COL_INDEX = 0;
export const GLIDE_BENCH_COL_DESCRIPTION = 1;
export const GLIDE_BENCH_COL_SEGMENTATION = 2;
