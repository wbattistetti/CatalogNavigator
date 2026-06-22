/**
 * Document tabular grid — same Glide setup as GlideBenchSegmentGrid (proven scroll).
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GridColumn } from '@glideapps/glide-data-grid';
import {
  DataEditor,
  GridCellKind,
  type CellClickedEventArgs,
  type DataEditorRef,
  type EditableGridCell,
  type GridCell,
  type GridSelection,
  type Item,
  type Rectangle,
} from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';
import type { ColumnRole } from '../../lib/supabase';
import { useContainerSize } from '../../hooks/useContainerSize';
import { buildDisplayRowModel } from './tabularDisplayRows';
import {
  tabularGlideInstallLongTaskWatcher,
  tabularGlideLogMount,
  tabularGlideLogScrollRegion,
} from './tabularGlideDebug';
import {
  TABULAR_GLIDE_THEME,
  TABULAR_ROLE_CELL_THEME,
  TABULAR_ROLE_HEADER_THEME,
} from './tabularGlideTheme';
import {
  TabularCellExpandPopover,
  type TabularCellExpandAnchorRect,
} from './TabularCellExpandPopover';

/** Index column — matches bench; no rowMarkers (rowMarkers breaks scroll sync here). */
const COL_INDEX = 0;

interface ExpandedCellState {
  value: string;
  columnWidthPx: number;
  anchorRect: TabularCellExpandAnchorRect;
}

/** Resolves screen-space cell bounds for the expand popover. */
function resolveCellAnchorRect(
  editorRef: React.RefObject<DataEditorRef | null>,
  cell: Item,
  eventBounds: Rectangle,
  container: HTMLElement | null,
): TabularCellExpandAnchorRect {
  const fromEditor = editorRef.current?.getBounds(cell[0], cell[1]);
  if (fromEditor) {
    return {
      x: fromEditor.x,
      y: fromEditor.y,
      width: fromEditor.width,
      height: fromEditor.height,
    };
  }

  const canvas = container?.querySelector('canvas');
  const base = canvas?.getBoundingClientRect() ?? container?.getBoundingClientRect();
  if (!base) {
    return {
      x: eventBounds.x,
      y: eventBounds.y,
      width: eventBounds.width,
      height: eventBounds.height,
    };
  }

  return {
    x: base.left + eventBounds.x,
    y: base.top + eventBounds.y,
    width: eventBounds.width,
    height: eventBounds.height,
  };
}

export interface TabularGlideGridProps {
  headers: readonly string[];
  rows: readonly string[][];
  visibleColumnIndices: readonly number[];
  columnRoles: Readonly<Record<string, ColumnRole>>;
  columns: readonly GridColumn[];
  filter: string;
  rowCount: number;
  onCellEdited: (sourceRowIndex: number, sourceColIndex: number, value: string) => void;
  onDeleteRows: (sourceRowIndices: number[]) => void;
  onHeaderClicked: (headerName: string, columnIndex: number) => void;
}

export const TabularGlideGrid = memo(function TabularGlideGrid({
  headers,
  rows,
  visibleColumnIndices,
  columnRoles,
  columns,
  filter,
  rowCount,
  onCellEdited,
  onDeleteRows,
  onHeaderClicked,
}: TabularGlideGridProps) {
  const { containerRef, size } = useContainerSize();
  const editorRef = useRef<DataEditorRef>(null);
  const [expandedCell, setExpandedCell] = useState<ExpandedCellState | null>(null);

  useEffect(() => tabularGlideInstallLongTaskWatcher(), []);

  const rowModel = useMemo(
    () => buildDisplayRowModel(rows.length, rows, visibleColumnIndices, filter),
    [rows, visibleColumnIndices, filter, rows.length],
  );

  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const headersRef = useRef(headers);
  headersRef.current = headers;
  const visibleRef = useRef(visibleColumnIndices);
  visibleRef.current = visibleColumnIndices;
  const rolesRef = useRef(columnRoles);
  rolesRef.current = columnRoles;
  const rowModelRef = useRef(rowModel);
  rowModelRef.current = rowModel;
  const onCellEditedRef = useRef(onCellEdited);
  onCellEditedRef.current = onCellEdited;
  const onDeleteRowsRef = useRef(onDeleteRows);
  onDeleteRowsRef.current = onDeleteRows;
  const onHeaderClickedRef = useRef(onHeaderClicked);
  onHeaderClickedRef.current = onHeaderClicked;
  const gridColumnsRef = useRef<GridColumn[]>([]);

  const gridColumns = useMemo<GridColumn[]>(
    () => [
      { title: '#', id: 'index', width: 56 },
      ...columns.map((col, i) => {
        const sourceCol = visibleColumnIndices[i];
        if (sourceCol === undefined) return col;
        const header = headers[sourceCol];
        const role = columnRoles[header];
        if (!role) return col;
        return { ...col, theme: TABULAR_ROLE_HEADER_THEME[role] };
      }),
    ],
    [columns, headers, visibleColumnIndices, columnRoles],
  );
  gridColumnsRef.current = gridColumns;

  const getCellContent = useCallback(([col, row]: Item): GridCell => {
    const sourceRow = rowModelRef.current.toSourceIndex(row);
    if (sourceRow === undefined) {
      return { kind: GridCellKind.Loading, allowOverlay: false };
    }

    if (col === COL_INDEX) {
      const label = String(sourceRow + 1);
      return {
        kind: GridCellKind.Text,
        data: label,
        displayData: label,
        readonly: true,
        allowOverlay: false,
      };
    }

    const dataCol = col - 1;
    const sourceCol = visibleRef.current[dataCol];
    if (sourceCol === undefined) {
      return { kind: GridCellKind.Loading, allowOverlay: false };
    }

    const header = headersRef.current[sourceCol] ?? '';
    const role = rolesRef.current[header];
    const value = rowsRef.current[sourceRow]?.[sourceCol] ?? '';
    const themeOverride = role ? TABULAR_ROLE_CELL_THEME[role] : undefined;

    return {
      kind: GridCellKind.Text,
      data: value,
      displayData: value,
      readonly: role === 'ignore',
      allowOverlay: role !== 'ignore',
      themeOverride,
    };
  }, []);

  const openExpandedCell = useCallback((cell: Item, event: CellClickedEventArgs) => {
    const [gridCol, displayRow] = cell;
    if (gridCol === COL_INDEX) return;

    const dataCol = gridCol - 1;
    const sourceCol = visibleRef.current[dataCol];
    if (sourceCol === undefined) return;

    const sourceRow = rowModelRef.current.toSourceIndex(displayRow);
    if (sourceRow === undefined) return;

    event.preventDefault();

    const value = rowsRef.current[sourceRow]?.[sourceCol] ?? '';
    const columnWidthPx =
      gridColumnsRef.current[gridCol]?.width ?? event.bounds.width;

    setExpandedCell({
      value,
      columnWidthPx: typeof columnWidthPx === 'number' ? columnWidthPx : event.bounds.width,
      anchorRect: resolveCellAnchorRect(
        editorRef,
        cell,
        event.bounds,
        containerRef.current,
      ),
    });
  }, [containerRef]);

  const onCellClickedHandler = useCallback((cell: Item, event: CellClickedEventArgs) => {
    if (!event.isDoubleClick || event.kind !== 'cell') return;
    openExpandedCell(cell, event);
  }, [openExpandedCell]);

  const onCellEditedHandler = useCallback((cell: Item, newValue: EditableGridCell) => {
    if (newValue.kind !== GridCellKind.Text) return;
    const [col, row] = cell;
    if (col === COL_INDEX) return;
    const dataCol = col - 1;
    const sourceRow = rowModelRef.current.toSourceIndex(row);
    const sourceCol = visibleRef.current[dataCol];
    if (sourceRow === undefined || sourceCol === undefined) return;
    onCellEditedRef.current(sourceRow, sourceCol, newValue.data);
  }, []);

  const onDelete = useCallback((selection: GridSelection) => {
    const selectedDisplayRows = selection.rows.toArray();
    if (selectedDisplayRows.length === 0) return true;

    const sourceIndices = selectedDisplayRows
      .map((displayRow) => rowModelRef.current.toSourceIndex(displayRow))
      .filter((idx): idx is number => idx !== undefined);

    if (sourceIndices.length > 0) {
      onDeleteRowsRef.current(sourceIndices);
    }
    return false;
  }, []);

  const onHeaderClickedHandler = useCallback((colIndex: number) => {
    if (colIndex === COL_INDEX) return;
    const dataCol = colIndex - 1;
    const sourceCol = visibleRef.current[dataCol];
    if (sourceCol === undefined) return;
    const headerName = headersRef.current[sourceCol];
    if (!headerName) return;
    onHeaderClickedRef.current(headerName, dataCol);
  }, []);

  const onVisibleRegionChanged = useCallback((range: Rectangle) => {
    setExpandedCell(null);
    tabularGlideLogScrollRegion({
      rows: rowModelRef.current.count,
      cols: gridColumnsRef.current.length,
      y: range.y,
      height: range.height,
    });
  }, []);

  const gridReady = size.width > 0 && size.height > 0;

  useEffect(() => {
    if (!gridReady) return;
    tabularGlideLogMount('ready', {
      width: size.width,
      height: size.height,
      rowCount,
      displayRows: rowModel.count,
      cols: gridColumns.length,
      filter: filter || '(none)',
    });
  }, [gridReady, size.width, size.height, rowCount, rowModel.count, gridColumns.length, filter]);

  useEffect(() => {
    setExpandedCell(null);
  }, [filter, visibleColumnIndices, rowCount]);

  if (visibleColumnIndices.length === 0) {
    return (
      <div className="flex flex-1 min-h-0 items-center justify-center font-mono text-xs text-emerald-400/35">
        Nessuna colonna visibile.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="tabular-glide-grid relative flex-1 min-h-0 min-w-0"
      style={{ height: '100%', width: '100%' }}
    >
      {gridReady ? (
        <DataEditor
          ref={editorRef}
          columns={gridColumns}
          rows={rowModel.count}
          getCellContent={getCellContent}
          onCellClicked={onCellClickedHandler}
          onCellEdited={onCellEditedHandler}
          onDelete={onDelete}
          onHeaderClicked={onHeaderClickedHandler}
          onVisibleRegionChanged={onVisibleRegionChanged}
          rowHeight={36}
          headerHeight={36}
          width={size.width}
          height={size.height}
          theme={TABULAR_GLIDE_THEME}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center font-mono text-xs text-emerald-400/35">
          Caricamento griglia…
        </div>
      )}
      {expandedCell && (
        <TabularCellExpandPopover
          value={expandedCell.value}
          columnWidthPx={expandedCell.columnWidthPx}
          anchorRect={expandedCell.anchorRect}
          onClose={() => setExpandedCell(null)}
        />
      )}
    </div>
  );
});
