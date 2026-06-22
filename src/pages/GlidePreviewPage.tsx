/**
 * Isolated Glide scroll benchmark — no filter, edit, or column roles.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  DataEditor,
  GridCellKind,
  type GridCell,
  type GridColumn,
  type Item,
  type Rectangle,
} from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';
import type { ParsedTabular } from '../lib/parseTabular';
import { useContainerSize } from '../hooks/useContainerSize';
import {
  tabularGlideInstallLongTaskWatcher,
  tabularGlideLogMount,
  tabularGlideLogScrollRegion,
} from '../components/DocumentViewer/tabularGlideDebug';
import { TABULAR_GLIDE_THEME } from '../components/DocumentViewer/tabularGlideTheme';

export interface GlidePreviewPageProps {
  tabular: ParsedTabular;
  onScrollRegion?: (firstRow: number, lastRow: number) => void;
}

export function GlidePreviewPage({ tabular, onScrollRegion }: GlidePreviewPageProps) {
  const { headers, rows } = tabular;
  const { containerRef, size } = useContainerSize();
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => tabularGlideInstallLongTaskWatcher(), []);

  const columns = useMemo<GridColumn[]>(
    () => headers.map((h) => ({ title: h, id: h, width: 150 })),
    [headers],
  );

  const getCellContent = useCallback(([col, row]: Item): GridCell => {
    const value = rowsRef.current[row]?.[col] ?? '';
    return {
      kind: GridCellKind.Text,
      data: value,
      displayData: value,
      allowOverlay: false,
    };
  }, []);

  const gridReady = size.width > 0 && size.height > 0;

  useEffect(() => {
    if (!gridReady) return;
    tabularGlideLogMount('bench-ready', {
      width: size.width,
      height: size.height,
      rows: rows.length,
      cols: headers.length,
    });
  }, [gridReady, size.width, size.height, rows.length, headers.length]);

  const onScrollRegionRef = useRef(onScrollRegion);
  onScrollRegionRef.current = onScrollRegion;

  const onVisibleRegionChanged = useCallback((range: Rectangle) => {
    const firstRow = range.y + 1;
    const lastRow = range.y + range.height;
    onScrollRegionRef.current?.(firstRow, lastRow);
    tabularGlideLogScrollRegion({
      rows: rows.length,
      cols: headers.length,
      y: range.y,
      height: range.height,
    });
  }, [rows.length, headers.length]);

  return (
    <div
      ref={containerRef}
      className="tabular-glide-grid tabular-glide-bench"
      style={{ height: '100%', width: '100%' }}
    >
      {gridReady ? (
        <DataEditor
          columns={columns}
          rows={rows.length}
          getCellContent={getCellContent}
          onVisibleRegionChanged={onVisibleRegionChanged}
          rowMarkers="number"
          rowHeight={36}
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
