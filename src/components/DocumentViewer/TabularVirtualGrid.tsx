/**
 * DOM virtual-scrolled tabular grid for large CSV documents (11k+ rows).
 * Renders only visible rows — same pattern as CorpusVirtualTable.
 */
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import type { ColumnRole } from '../../lib/supabase';
import { useCorpusVirtualScroll } from '../../hooks/useCorpusVirtualScroll';
import { buildDisplayRowModel } from './tabularDisplayRows';
import {
  autoColumnWidthPx,
  buildTabularGridTemplate,
  sampleRowsForWidth,
  TABULAR_ROW_HEIGHT_PX,
  tabularTableMinWidthPx,
} from './tabularLayout';
import { TABULAR_ROLE_CONFIG } from './tabularRoleConfig';
import { TabularVirtualRow } from './TabularVirtualRow';

export interface TabularVirtualGridProps {
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

interface EditingCell {
  sourceRowIndex: number;
  sourceColIndex: number;
}

export const TabularVirtualGrid = memo(function TabularVirtualGrid({
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
}: TabularVirtualGridProps) {
  const rowModel = useMemo(
    () => buildDisplayRowModel(rows.length, rows, visibleColumnIndices, filter),
    [rows, visibleColumnIndices, filter, rows.length],
  );

  const { setContainerRef, range, totalHeight } = useCorpusVirtualScroll(
    rowModel.count,
    TABULAR_ROW_HEIGHT_PX,
  );

  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);

  const onCellEditedRef = useRef(onCellEdited);
  onCellEditedRef.current = onCellEdited;
  const onDeleteRowRef = useRef(onDeleteRow);
  onDeleteRowRef.current = onDeleteRow;
  const onHeaderClickedRef = useRef(onHeaderClicked);
  onHeaderClickedRef.current = onHeaderClicked;

  const rowModelRef = useRef(rowModel);
  rowModelRef.current = rowModel;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const widthSampleRows = useMemo(
    () => sampleRowsForWidth(rows as string[][]),
    [rows],
  );

  const columnWidths = useMemo(
    () =>
      visibleColumnIndices.map((ci, vi) =>
        autoColumnWidthPx(
          headers[ci] ?? '',
          widthSampleRows,
          ci,
          vi === 0 ? ` (${displayRowCount}/${totalRowCount})`.length : 0,
        ),
      ),
    [visibleColumnIndices, headers, widthSampleRows, displayRowCount, totalRowCount],
  );

  const gridTemplate = useMemo(
    () => buildTabularGridTemplate(columnWidths, 0),
    [columnWidths],
  );

  const tableMinWidth = useMemo(
    () => tabularTableMinWidthPx(columnWidths, 0),
    [columnWidths],
  );

  const visibleRows = useMemo(() => {
    const slice: number[] = [];
    for (let displayRow = range.start; displayRow < range.end; displayRow++) {
      const sourceRowIndex = rowModelRef.current.toSourceIndex(displayRow);
      if (sourceRowIndex !== undefined) slice.push(sourceRowIndex);
    }
    return slice;
  }, [range.start, range.end, rowModel]);

  const handleStartEdit = useCallback((sourceRowIndex: number, sourceColIndex: number) => {
    setEditingCell({ sourceRowIndex, sourceColIndex });
  }, []);

  const handleCommitEdit = useCallback((sourceRowIndex: number, sourceColIndex: number, value: string) => {
    setEditingCell(null);
    onCellEditedRef.current(sourceRowIndex, sourceColIndex, value);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingCell(null);
  }, []);

  const handleDeleteRow = useCallback((sourceRowIndex: number) => {
    onDeleteRowRef.current(sourceRowIndex);
  }, []);

  const handleHeaderClick = useCallback((title: string) => {
    onHeaderClickedRef.current(title);
  }, []);

  if (visibleColumnIndices.length === 0) {
    return (
      <div className="flex flex-1 min-h-0 items-center justify-center font-mono text-xs text-emerald-400/35">
        Nessuna colonna visibile.
      </div>
    );
  }

  return (
    <div
      ref={setContainerRef}
      className="tabular-virtual-grid flex-1 min-h-0 h-0 min-w-0 w-full overflow-auto overscroll-contain"
    >
      <div style={{ minWidth: tableMinWidth }}>
        <div
          className="sticky top-0 z-10 grid border-b border-[#1a3a2a] bg-[#0a1510]"
          style={{ gridTemplateColumns: gridTemplate, minHeight: TABULAR_ROW_HEIGHT_PX }}
        >
          <div className="flex items-center justify-center border-r border-[#1a3a2a]/60 font-mono text-[9px] text-emerald-400/40">
            #
          </div>
          {visibleColumnIndices.map((sourceCol, vi) => {
            const title = headers[sourceCol] ?? '';
            const role = columnRoles[title];
            const rcfg = role ? TABULAR_ROLE_CONFIG[role] : null;
            const label = vi === 0
              ? `${title} (${displayRowCount.toLocaleString('it-IT')}/${totalRowCount.toLocaleString('it-IT')})`
              : `${title}${role ? ` · ${TABULAR_ROLE_CONFIG[role].label}` : ''}`;

            return (
              <button
                key={sourceCol}
                type="button"
                onClick={() => handleHeaderClick(title)}
                className={`min-w-0 px-2 py-1 text-left font-mono text-[10px] border-r border-[#1a3a2a]/60 truncate transition-colors hover:brightness-125 ${
                  rcfg ? `${rcfg.thBg} ${rcfg.thText}` : 'text-emerald-300/80'
                }`}
                title={label}
              >
                {label}
              </button>
            );
          })}
        </div>

        {rowModel.count === 0 ? (
          <div className="px-4 py-8 text-center font-mono text-xs text-emerald-400/35">
            Nessuna riga corrisponde al filtro.
          </div>
        ) : (
          <div style={{ height: totalHeight, position: 'relative' }}>
            <div style={{ transform: `translateY(${range.offsetY}px)` }}>
              {visibleRows.map((sourceRowIndex) => (
                <TabularVirtualRow
                  key={sourceRowIndex}
                  sourceRowIndex={sourceRowIndex}
                  row={rowsRef.current[sourceRowIndex]!}
                  visibleColumnIndices={visibleColumnIndices}
                  headers={headers}
                  columnRoles={columnRoles}
                  gridTemplate={gridTemplate}
                  editingColIndex={
                    editingCell?.sourceRowIndex === sourceRowIndex
                      ? editingCell.sourceColIndex
                      : null
                  }
                  onStartEdit={handleStartEdit}
                  onCommitEdit={handleCommitEdit}
                  onCancelEdit={handleCancelEdit}
                  onDeleteRow={handleDeleteRow}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
