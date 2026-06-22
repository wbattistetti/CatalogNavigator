/**
 * Glide benchmark grid: #, description, segmentation (canvas chips + overlay editor).
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  DataEditor,
  GridCellKind,
  type GridCell,
  type GridColumn,
  type Item,
  type Rectangle,
  type CustomCell,
} from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';
import { useContainerSize } from '../../hooks/useContainerSize';
import {
  tabularGlideInstallLongTaskWatcher,
  tabularGlideLogMount,
  tabularGlideLogScrollRegion,
} from '../../components/DocumentViewer/tabularGlideDebug';
import { TABULAR_GLIDE_THEME } from '../../components/DocumentViewer/tabularGlideTheme';
import type { GlideBenchRow } from './glideBenchTypes';
import {
  GLIDE_BENCH_COL_DESCRIPTION,
  GLIDE_BENCH_COL_INDEX,
  GLIDE_BENCH_COL_SEGMENTATION,
  GLIDE_BENCH_SEG_CELL,
  type GlideBenchSegCellData,
} from './glideBenchTypes';
import {
  buildGlideBenchSegCell,
  glideBenchSegmentationRenderer,
  isGlideBenchSegCell,
} from './glideBenchSegmentationRenderer';
import { GlideBenchSegmentationEditor } from './GlideBenchSegmentationEditor';

export interface GlideBenchSegmentGridProps {
  rows: readonly GlideBenchRow[];
  onScrollRegion?: (firstRow: number, lastRow: number) => void;
}

const BENCH_COLUMNS: GridColumn[] = [
  { title: '#', id: 'index', width: 56 },
  { title: 'descrizione', id: 'description', width: 420, grow: 1 },
  { title: 'segmentazione', id: 'segmentation', width: 360, grow: 1 },
];

export function GlideBenchSegmentGrid({ rows, onScrollRegion }: GlideBenchSegmentGridProps) {
  const { containerRef, size } = useContainerSize();
  const benchRowsRef = useRef(rows);
  benchRowsRef.current = rows;

  useEffect(() => tabularGlideInstallLongTaskWatcher(), []);

  const getCellContent = useCallback(([col, row]: Item): GridCell => {
    const benchRow = benchRowsRef.current[row];
    if (!benchRow) {
      return { kind: GridCellKind.Loading, allowOverlay: false };
    }

    if (col === GLIDE_BENCH_COL_INDEX) {
      const label = String(benchRow.sourceIndex + 1);
      return {
        kind: GridCellKind.Text,
        data: label,
        displayData: label,
        readonly: true,
        allowOverlay: false,
      };
    }

    if (col === GLIDE_BENCH_COL_DESCRIPTION) {
      const text = benchRow.description;
      return {
        kind: GridCellKind.Text,
        data: text,
        displayData: text,
        readonly: true,
        allowOverlay: false,
        allowWrapping: true,
      };
    }

    if (col === GLIDE_BENCH_COL_SEGMENTATION) {
      const cellData: GlideBenchSegCellData = {
        type: GLIDE_BENCH_SEG_CELL,
        sourceText: benchRow.description,
        segments: benchRow.paints,
        unmatched: benchRow.segmentation.unmatched,
      };
      return buildGlideBenchSegCell(cellData);
    }

    return { kind: GridCellKind.Loading, allowOverlay: false };
  }, []);

  const provideEditor = useCallback((cell: GridCell) => {
    if (cell.kind !== GridCellKind.Custom) return undefined;
    if (!isGlideBenchSegCell(cell as CustomCell)) return undefined;
    return {
      editor: GlideBenchSegmentationEditor,
      disablePadding: true,
    };
  }, []);

  const gridReady = size.width > 0 && size.height > 0;

  useEffect(() => {
    if (!gridReady) return;
    tabularGlideLogMount('bench-seg-ready', {
      width: size.width,
      height: size.height,
      rows: rows.length,
      cols: BENCH_COLUMNS.length,
    });
  }, [gridReady, size.width, size.height, rows.length]);

  const onScrollRegionRef = useRef(onScrollRegion);
  onScrollRegionRef.current = onScrollRegion;

  const onVisibleRegionChanged = useCallback((range: Rectangle) => {
    onScrollRegionRef.current?.(range.y + 1, range.y + range.height);
    tabularGlideLogScrollRegion({
      rows: benchRowsRef.current.length,
      cols: BENCH_COLUMNS.length,
      y: range.y,
      height: range.height,
    });
  }, []);

  const customRenderers = useMemo(() => [glideBenchSegmentationRenderer], []);

  return (
    <div
      ref={containerRef}
      className="tabular-glide-grid tabular-glide-bench"
      style={{ height: '100%', width: '100%' }}
    >
      {gridReady ? (
        <DataEditor
          columns={BENCH_COLUMNS}
          rows={rows.length}
          getCellContent={getCellContent}
          provideEditor={provideEditor}
          customRenderers={customRenderers}
          onVisibleRegionChanged={onVisibleRegionChanged}
          rowHeight={48}
          headerHeight={36}
          width={size.width}
          height={size.height}
          theme={TABULAR_GLIDE_THEME}
          smoothScrollX
          smoothScrollY
          experimental={{ scrollbarWidthOverride: 16 }}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center font-mono text-xs text-emerald-400/35">
          Caricamento griglia…
        </div>
      )}
    </div>
  );
}
