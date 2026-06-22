/**
 * Single virtualized row in the tabular document preview grid.
 */
import { memo, useCallback, useEffect, useRef } from 'react';
import { Trash2 } from 'lucide-react';
import type { ColumnRole } from '../../lib/supabase';
import { TABULAR_ROW_HEIGHT_PX } from './tabularLayout';
import { TABULAR_ROLE_CONFIG } from './tabularRoleConfig';

export interface TabularVirtualRowProps {
  sourceRowIndex: number;
  row: readonly string[];
  visibleColumnIndices: readonly number[];
  headers: readonly string[];
  columnRoles: Readonly<Record<string, ColumnRole>>;
  gridTemplate: string;
  /** Source column index being edited, or null if this row is not in edit mode. */
  editingColIndex: number | null;
  onStartEdit: (sourceRowIndex: number, sourceColIndex: number) => void;
  onCommitEdit: (sourceRowIndex: number, sourceColIndex: number, value: string) => void;
  onCancelEdit: () => void;
  onDeleteRow: (sourceRowIndex: number) => void;
}

function TabularVirtualRowInner({
  sourceRowIndex,
  row,
  visibleColumnIndices,
  headers,
  columnRoles,
  gridTemplate,
  editingColIndex,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onDeleteRow,
}: TabularVirtualRowProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingColIndex !== null && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingColIndex]);

  const handleDelete = useCallback(() => {
    onDeleteRow(sourceRowIndex);
  }, [onDeleteRow, sourceRowIndex]);

  return (
    <div
      className="grid items-stretch border-b border-[#111] hover:bg-[#0f1a12]/80"
      style={{ gridTemplateColumns: gridTemplate, minHeight: TABULAR_ROW_HEIGHT_PX }}
    >
      <div className="flex items-center justify-center border-r border-[#1a3a2a]/60">
        <button
          type="button"
          onClick={handleDelete}
          className="p-1 text-emerald-400/25 hover:text-red-400/80 transition-colors"
          title={`Elimina riga ${sourceRowIndex + 1}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {visibleColumnIndices.map((sourceCol) => {
        const header = headers[sourceCol] ?? '';
        const role = columnRoles[header];
        const rcfg = role ? TABULAR_ROLE_CONFIG[role] : null;
        const value = row[sourceCol] ?? '';
        const cellEditing = editingColIndex === sourceCol;
        const readonly = role === 'ignore';

        return (
          <div
            key={sourceCol}
            className={`min-w-0 px-2 py-1 font-mono text-xs border-r border-[#1a3a2a]/40 flex items-center ${
              rcfg?.tdBg ?? ''
            } ${readonly ? 'text-emerald-400/35' : 'text-emerald-200/90'}`}
            title={value.length > 80 ? value : undefined}
            onDoubleClick={() => {
              if (!readonly) onStartEdit(sourceRowIndex, sourceCol);
            }}
          >
            {cellEditing ? (
              <input
                ref={inputRef}
                defaultValue={value}
                className="w-full min-w-0 bg-[#0a1510] border border-emerald-400/40 rounded px-1 py-0.5 font-mono text-xs text-emerald-100 focus:outline-none"
                onBlur={(e) => onCommitEdit(sourceRowIndex, sourceCol, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onCommitEdit(sourceRowIndex, sourceCol, e.currentTarget.value);
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    onCancelEdit();
                  }
                }}
              />
            ) : (
              <span className="truncate block w-full">{value}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function virtualRowPropsEqual(
  prev: TabularVirtualRowProps,
  next: TabularVirtualRowProps,
): boolean {
  return prev.sourceRowIndex === next.sourceRowIndex
    && prev.row === next.row
    && prev.gridTemplate === next.gridTemplate
    && prev.visibleColumnIndices === next.visibleColumnIndices
    && prev.headers === next.headers
    && prev.columnRoles === next.columnRoles
    && prev.editingColIndex === next.editingColIndex
    && prev.onStartEdit === next.onStartEdit
    && prev.onCommitEdit === next.onCommitEdit
    && prev.onCancelEdit === next.onCancelEdit
    && prev.onDeleteRow === next.onDeleteRow;
}

export const TabularVirtualRow = memo(TabularVirtualRowInner, virtualRowPropsEqual);
