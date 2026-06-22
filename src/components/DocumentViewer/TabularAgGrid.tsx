/**
 * AG Grid tabular preview — virtualised scroll for 10k+ CSV rows.
 */
import { memo, useCallback, useMemo, useRef } from 'react';
import { AgGridProvider, AgGridReact } from 'ag-grid-react';
import type {
  CellValueChangedEvent,
  ColDef,
  ColumnHeaderClickedEvent,
  GetRowIdParams,
  GridReadyEvent,
} from 'ag-grid-community';
import type { ColumnRole } from '../../lib/supabase';
import { useContainerSize } from '../../hooks/useContainerSize';
import { buildDisplayRowIndices } from './tabularDisplayRows';
import { autoColumnWidthPx, sampleRowsForWidth, TABULAR_DELETE_COL_WIDTH_PX } from './tabularLayout';
import { TABULAR_ROLE_CONFIG } from './tabularRoleConfig';
import { TABULAR_ROLE_CELL_BG, TABULAR_ROLE_HEADER_BG } from './tabularGlideTheme';
import { TABULAR_AG_GRID_MODULES } from './tabularAgGridModules';
import { TABULAR_AG_THEME } from './tabularAgTheme';
import {
  buildAllTabularAgRowHandles,
  buildTabularAgRowHandles,
  columnField,
  type TabularAgGridContext,
  type TabularAgRow,
} from './tabularAgGridTypes';
import { TabularAgDeleteCell } from './tabularAgDeleteCell';
import { tabularGlideLogMount } from './tabularGlideDebug';

export interface TabularAgGridProps {
  headers: readonly string[];
  rows: readonly string[][];
  visibleColumnIndices: readonly number[];
  columnRoles: Readonly<Record<string, ColumnRole>>;
  filter: string;
  displayRowCount: number;
  totalRowCount: number;
  onCellEdited: (sourceRowIndex: number, sourceColIndex: number, value: string) => void;
  onDeleteRow: (sourceRowIndex: number) => void;
  onHeaderClicked: (headerName: string) => void;
}

export const TabularAgGrid = memo(function TabularAgGrid({
  headers,
  rows,
  visibleColumnIndices,
  columnRoles,
  filter,
  displayRowCount,
  totalRowCount,
  onCellEdited,
  onDeleteRow,
  onHeaderClicked,
}: TabularAgGridProps) {
  const { containerRef, size } = useContainerSize();
  const gridReady = size.width > 0 && size.height > 0;

  const onCellEditedRef = useRef(onCellEdited);
  onCellEditedRef.current = onCellEdited;
  const onDeleteRowRef = useRef(onDeleteRow);
  onDeleteRowRef.current = onDeleteRow;
  const onHeaderClickedRef = useRef(onHeaderClicked);
  onHeaderClickedRef.current = onHeaderClicked;

  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const gridContext = useMemo((): TabularAgGridContext => ({
    onDeleteRow: (sourceRowIndex) => onDeleteRowRef.current(sourceRowIndex),
  }), []);

  const widthSampleRows = useMemo(
    () => sampleRowsForWidth(rows as string[][]),
    [rows],
  );

  const rowData = useMemo((): TabularAgRow[] => {
    const trimmed = filter.trim();
    if (!trimmed) {
      return buildAllTabularAgRowHandles(rows.length);
    }
    const indices = buildDisplayRowIndices(
      rows.length,
      rows as string[][],
      [...visibleColumnIndices],
      filter,
    );
    return buildTabularAgRowHandles(indices);
  }, [rows, filter, visibleColumnIndices, rows.length]);

  const columnDefs = useMemo((): ColDef<TabularAgRow>[] => {
    const deleteCol: ColDef<TabularAgRow> = {
      colId: '_delete',
      headerName: '#',
      width: TABULAR_DELETE_COL_WIDTH_PX,
      minWidth: TABULAR_DELETE_COL_WIDTH_PX,
      maxWidth: TABULAR_DELETE_COL_WIDTH_PX,
      pinned: 'left',
      sortable: false,
      filter: false,
      editable: false,
      resizable: false,
      suppressHeaderMenuButton: true,
      cellRenderer: TabularAgDeleteCell,
    };

    const dataCols = visibleColumnIndices.map((sourceCol, vi): ColDef<TabularAgRow> => {
      const header = headers[sourceCol] ?? '';
      const role = columnRoles[header];
      const suffix = role ? ` · ${TABULAR_ROLE_CONFIG[role].label}` : '';
      const headerLabel = vi === 0
        ? `${header} (${displayRowCount.toLocaleString('it-IT')}/${totalRowCount.toLocaleString('it-IT')})`
        : `${header}${suffix}`;

      return {
        colId: columnField(sourceCol),
        field: columnField(sourceCol),
        headerName: headerLabel,
        width: autoColumnWidthPx(
          header,
          widthSampleRows,
          sourceCol,
          vi === 0 ? ` (${displayRowCount}/${totalRowCount})`.length : 0,
        ),
        sortable: false,
        filter: false,
        editable: () => columnRoles[header] !== 'ignore',
        valueGetter: (params) => {
          const idx = params.data?.__sourceIndex;
          if (idx === undefined) return '';
          return rowsRef.current[idx]?.[sourceCol] ?? '';
        },
        tooltipValueGetter: (params) => {
          const idx = params.data?.__sourceIndex;
          if (idx === undefined) return '';
          return rowsRef.current[idx]?.[sourceCol] ?? '';
        },
        headerStyle: role
          ? { backgroundColor: TABULAR_ROLE_HEADER_BG[role], color: '#d1fae5' }
          : { backgroundColor: '#0a1510', color: '#6ee7b7' },
        cellStyle: role
          ? { backgroundColor: TABULAR_ROLE_CELL_BG[role], color: role === 'ignore' ? '#6b7280' : '#d1fae5' }
          : { backgroundColor: '#0d0d0d', color: '#d1fae5' },
      };
    });

    return [deleteCol, ...dataCols];
  }, [
    visibleColumnIndices,
    headers,
    columnRoles,
    widthSampleRows,
    displayRowCount,
    totalRowCount,
  ]);

  const defaultColDef = useMemo((): ColDef => ({
    resizable: true,
    suppressHeaderMenuButton: true,
    wrapText: false,
    autoHeight: false,
  }), []);

  const getRowId = useCallback(
    (params: GetRowIdParams<TabularAgRow>) => String(params.data.__sourceIndex),
    [],
  );

  const onCellValueChanged = useCallback((event: CellValueChangedEvent<TabularAgRow>) => {
    if (event.oldValue === event.newValue) return;
    const sourceRow = event.data?.__sourceIndex;
    const field = event.colDef.field;
    if (sourceRow === undefined || !field || !field.startsWith('c')) return;
    const sourceCol = Number.parseInt(field.slice(1), 10);
    if (Number.isNaN(sourceCol)) return;
    onCellEditedRef.current(sourceRow, sourceCol, String(event.newValue ?? ''));
  }, []);

  const onColumnHeaderClicked = useCallback((event: ColumnHeaderClickedEvent) => {
    const colId = event.column?.getColId();
    if (!colId || colId === '_delete' || !colId.startsWith('c')) return;
    const sourceCol = Number.parseInt(colId.slice(1), 10);
    if (Number.isNaN(sourceCol)) return;
    const headerName = headers[sourceCol];
    if (headerName) onHeaderClickedRef.current(headerName);
  }, [headers]);

  const onGridReady = useCallback((_event: GridReadyEvent) => {
    tabularGlideLogMount('ag-ready', {
      width: size.width,
      height: size.height,
      displayRows: rowData.length,
      totalRows: totalRowCount,
      cols: visibleColumnIndices.length,
      filter: filter || '(none)',
    });
  }, [size.width, size.height, rowData.length, totalRowCount, visibleColumnIndices.length, filter]);

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
      className="tabular-ag-grid flex flex-1 min-h-0 min-w-0 w-full"
    >
      <AgGridProvider modules={TABULAR_AG_GRID_MODULES}>
        {gridReady ? (
          <div style={{ width: size.width, height: size.height }}>
            <AgGridReact<TabularAgRow>
              theme={TABULAR_AG_THEME}
              rowData={rowData}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              getRowId={getRowId}
              context={gridContext}
              onCellValueChanged={onCellValueChanged}
              onColumnHeaderClicked={onColumnHeaderClicked}
              onGridReady={onGridReady}
              animateRows={false}
              rowBuffer={24}
              suppressMovableColumns
              enableCellTextSelection
              ensureDomOrder
              singleClickEdit={false}
              stopEditingWhenCellsLoseFocus
            />
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center font-mono text-xs text-emerald-400/35">
            Caricamento griglia…
          </div>
        )}
      </AgGridProvider>
    </div>
  );
});
