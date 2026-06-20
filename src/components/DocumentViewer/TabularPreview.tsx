import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Eye, EyeOff, Loader2, Pencil, Trash2, X } from 'lucide-react';
import type { ColumnRole, KbDocument } from '../../lib/supabase';
import { persistDocumentColumnRoles } from '../../lib/columnRoles';
import { persistTabularDocument } from '../../lib/persistTabularDocument';
import type { ParsedTabular } from '../../lib/parseTabular';

interface TabularPreviewProps {
  doc: KbDocument;
  tabular: ParsedTabular;
  csvSeparator?: '\t' | ';' | ',' | null;
  initialRoles?: Record<string, ColumnRole>;
  onDocUpdated?: (doc: KbDocument) => void;
  onTabularChange?: (tabular: ParsedTabular) => void;
}

const ROLE_CONFIG: Record<ColumnRole, {
  label: string;
  thBg: string;
  thText: string;
  tdBg: string;
  dot: string;
  btnActive: string;
  btnInactive: string;
}> = {
  selector: {
    label: 'Selector',
    thBg: 'bg-orange-900/20',
    thText: 'text-orange-200/80',
    tdBg: 'bg-orange-900/[0.07]',
    dot: 'bg-orange-400',
    btnActive: 'bg-orange-500/25 text-orange-300 border-orange-500/40',
    btnInactive: 'text-orange-400/40 hover:text-orange-300/80 border-[#1a3a2a] hover:bg-orange-900/20',
  },
  data: {
    label: 'Data',
    thBg: 'bg-sky-900/20',
    thText: 'text-sky-200/80',
    tdBg: 'bg-sky-900/[0.07]',
    dot: 'bg-sky-400',
    btnActive: 'bg-sky-500/25 text-sky-300 border-sky-500/40',
    btnInactive: 'text-sky-400/40 hover:text-sky-300/80 border-[#1a3a2a] hover:bg-sky-900/20',
  },
  description: {
    label: 'Descrizione',
    thBg: 'bg-amber-900/20',
    thText: 'text-amber-200/80',
    tdBg: 'bg-amber-900/[0.07]',
    dot: 'bg-amber-400',
    btnActive: 'bg-amber-500/25 text-amber-300 border-amber-500/40',
    btnInactive: 'text-amber-400/40 hover:text-amber-300/80 border-[#1a3a2a] hover:bg-amber-900/20',
  },
  ignore: {
    label: 'Ignore',
    thBg: 'bg-gray-700/15',
    thText: 'text-gray-400/40',
    tdBg: 'bg-gray-700/[0.07]',
    dot: 'bg-gray-500',
    btnActive: 'bg-gray-600/25 text-gray-300 border-gray-500/40',
    btnInactive: 'text-gray-400/35 hover:text-gray-300/60 border-[#1a3a2a] hover:bg-gray-700/20',
  },
  ontology: {
    label: 'Descrizione',
    thBg: 'bg-amber-900/20',
    thText: 'text-amber-200/80',
    tdBg: 'bg-amber-900/[0.07]',
    dot: 'bg-amber-400',
    btnActive: 'bg-amber-500/25 text-amber-300 border-amber-500/40',
    btnInactive: 'text-amber-400/40 hover:text-amber-300/80 border-[#1a3a2a] hover:bg-amber-900/20',
  },
};

const ROLES: ColumnRole[] = ['description', 'selector', 'data', 'ignore'];

const TOOLBAR_HIDE_DELAY_MS = 320;

interface ColumnHeaderProps {
  header: string;
  isFirstVisible: boolean;
  role: ColumnRole | undefined;
  cfg: (typeof ROLE_CONFIG)[ColumnRole] | null;
  width: number;
  isFlexColumn: boolean;
  rowCountLabel: string;
  isToolbarOpen: boolean;
  onOpenToolbar: () => void;
  onScheduleCloseToolbar: () => void;
  onRoleChange: (role: ColumnRole) => void;
}

function ColumnHeader({
  header,
  isFirstVisible,
  role,
  cfg,
  width,
  isFlexColumn,
  rowCountLabel,
  isToolbarOpen,
  onOpenToolbar,
  onScheduleCloseToolbar,
  onRoleChange,
}: ColumnHeaderProps) {
  return (
    <th
      className={`relative px-3 pt-2 pb-1.5 font-mono text-xs font-semibold uppercase tracking-wider whitespace-nowrap border-r border-[#1a3a2a] last:border-r-0 select-none transition-colors align-top ${
        cfg ? `${cfg.thBg} ${cfg.thText}` : 'bg-[#0a1510] text-emerald-400/70'
      }`}
      style={isFlexColumn ? { minWidth: width } : { width, maxWidth: width }}
    >
      <div
        className="relative"
        onMouseEnter={onOpenToolbar}
        onMouseLeave={onScheduleCloseToolbar}
      >
        <div className="flex items-center gap-1.5 mb-1 min-w-0">
          {cfg && (
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
          )}
          <span className={isFlexColumn ? '' : 'truncate'}>{header}</span>
          {isFirstVisible && (
            <span className="flex-shrink-0 font-mono text-[9px] font-normal normal-case tracking-normal text-emerald-400/40 tabular-nums">
              {rowCountLabel}
            </span>
          )}
        </div>

        {isToolbarOpen && (
          <div className="absolute left-0 top-full z-30 pt-2">
            <div className="flex items-center gap-0.5 rounded border border-[#1a3a2a] bg-[#0a1510] p-0.5 shadow-lg">
              {ROLES.map((r) => {
                const rcfg = ROLE_CONFIG[r];
                const isActive = role === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onRoleChange(r);
                    }}
                    className={`px-1.5 py-0.5 font-mono text-[10px] rounded border transition-all ${
                      isActive ? rcfg.btnActive : rcfg.btnInactive
                    }`}
                  >
                    {rcfg.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </th>
  );
}

const FIXED_COLUMN_MAX_PX = 420;

/** Shrink-wrap column width to cell content (mono ~7px per char + horizontal padding). */
function autoColumnWidthPx(
  header: string,
  rows: string[][],
  colIdx: number,
  extraHeaderChars = 0,
  maxPx = FIXED_COLUMN_MAX_PX,
): number {
  const CHAR_PX = 7;
  const PADDING_PX = 36;
  const MIN_PX = 56;
  let maxChars = header.length + extraHeaderChars;
  for (const row of rows) {
    maxChars = Math.max(maxChars, (row[colIdx] ?? '').length);
  }
  return Math.min(maxPx, Math.max(MIN_PX, maxChars * CHAR_PX + PADDING_PX));
}

function isDescriptionLikeColumn(header: string, role: ColumnRole | undefined): boolean {
  if (role === 'description' || role === 'ontology') return true;
  return /descri|nome\s*visita/i.test(header);
}

interface TabularCellProps {
  cell: string;
  isFlexColumn: boolean;
  width: number;
  role: ColumnRole | undefined;
  cfg: (typeof ROLE_CONFIG)[ColumnRole] | null;
  isEditing: boolean;
  draftValue: string;
  isSaving: boolean;
  onDraftChange: (value: string) => void;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
}

function TabularCell({
  cell,
  isFlexColumn,
  width,
  role,
  cfg,
  isEditing,
  draftValue,
  isSaving,
  onDraftChange,
  onStartEdit,
  onSave,
  onCancel,
}: TabularCellProps) {
  if (isEditing) {
    return (
      <td
        className={`px-2 py-1.5 font-mono text-xs border-r border-[#111] last:border-r-0 align-top ${cfg ? cfg.tdBg : ''}`}
        style={isFlexColumn ? { minWidth: width } : { width, maxWidth: width }}
      >
        <textarea
          autoFocus
          value={draftValue}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSave();
            }
            if (e.key === 'Escape') onCancel();
          }}
          rows={Math.min(8, Math.max(2, draftValue.split('\n').length))}
          disabled={isSaving}
          className="w-full bg-[#080e0a] border border-amber-400/40 rounded px-2 py-1 font-mono text-xs text-emerald-100 resize-y focus:outline-none focus:border-amber-400/70 disabled:opacity-60"
        />
        <div className="flex items-center gap-1 mt-1">
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-emerald-400/40 bg-emerald-400/15 text-emerald-200 font-mono text-[10px] hover:bg-emerald-400/25 disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            Salva
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="p-0.5 text-emerald-400/40 hover:text-emerald-300/80 disabled:opacity-50"
            title="Annulla"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </td>
    );
  }

  return (
    <td
      title={isFlexColumn ? 'Doppio click per modificare' : cell || 'Doppio click per modificare'}
      onDoubleClick={onStartEdit}
      className={`group/cell relative px-3 py-1.5 font-mono text-xs border-r border-[#111] last:border-r-0 transition-colors cursor-text ${
        isFlexColumn
          ? 'whitespace-normal break-words'
          : 'whitespace-nowrap overflow-hidden text-ellipsis'
      } ${cfg ? cfg.tdBg : ''} ${
        role === 'ignore' ? 'text-gray-400/35' : 'text-emerald-300/80'
      }`}
      style={
        isFlexColumn
          ? { minWidth: width }
          : { width, maxWidth: width }
      }
    >
      {cell}
      <button
        type="button"
        onClick={onStartEdit}
        className="absolute top-1 right-1 p-0.5 rounded opacity-0 group-hover/cell:opacity-100 text-amber-300/70 hover:text-amber-200 hover:bg-amber-400/10 transition-opacity"
        title="Modifica cella"
      >
        <Pencil className="w-3 h-3" />
      </button>
    </td>
  );
}

export function TabularPreview({
  doc,
  tabular,
  csvSeparator = null,
  initialRoles = {},
  onDocUpdated,
  onTabularChange,
}: TabularPreviewProps) {
  const [localTabular, setLocalTabular] = useState(tabular);
  const { headers, rows } = localTabular;
  const [filter, setFilter] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [columnRoles, setColumnRoles] = useState<Record<string, ColumnRole>>(initialRoles);
  const [openToolbarCol, setOpenToolbarCol] = useState<string | null>(null);
  const [deletingSourceIndex, setDeletingSourceIndex] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ sourceIndex: number; colIndex: number } | null>(null);
  const [cellDraft, setCellDraft] = useState('');
  const [savingCell, setSavingCell] = useState<{ sourceIndex: number; colIndex: number } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const hideToolbarTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalTabular(tabular);
    setEditingCell(null);
    setCellDraft('');
  }, [tabular, doc.id]);

  const openToolbar = useCallback((col: string) => {
    if (hideToolbarTimer.current) {
      clearTimeout(hideToolbarTimer.current);
      hideToolbarTimer.current = null;
    }
    setOpenToolbarCol(col);
  }, []);

  const scheduleCloseToolbar = useCallback(() => {
    if (hideToolbarTimer.current) clearTimeout(hideToolbarTimer.current);
    hideToolbarTimer.current = setTimeout(() => {
      setOpenToolbarCol(null);
      hideToolbarTimer.current = null;
    }, TOOLBAR_HIDE_DELAY_MS);
  }, []);

  useEffect(() => () => {
    if (hideToolbarTimer.current) clearTimeout(hideToolbarTimer.current);
  }, []);

  useEffect(() => {
    setColumnRoles(initialRoles);
  }, [initialRoles, doc.id]);

  const visibleIndices = headers.reduce<number[]>((acc, h, i) => {
    if (!showAll && columnRoles[h] === 'ignore') return acc;
    acc.push(i);
    return acc;
  }, []);

  const filteredEntries = useMemo(() => {
    const entries = rows.map((row, sourceIndex) => ({ row, sourceIndex }));
    if (!filter) return entries;
    const needle = filter.toLowerCase();
    return entries.filter(({ row }) =>
      visibleIndices.some((ci) => row[ci]?.toLowerCase().includes(needle)),
    );
  }, [rows, filter, visibleIndices]);

  const sortColIdx = useMemo(() => {
    const byRole = headers.findIndex((h) => columnRoles[h] === 'description');
    if (byRole >= 0) return byRole;
    const byName = headers.findIndex((h) => /descri/i.test(h));
    if (byName >= 0) return byName;
    return visibleIndices[0] ?? 0;
  }, [headers, columnRoles, visibleIndices]);

  const sortedEntries = useMemo(
    () =>
      [...filteredEntries].sort((a, b) =>
        (a.row[sortColIdx] ?? '').localeCompare(b.row[sortColIdx] ?? '', 'it', { sensitivity: 'base' }),
      ),
    [filteredEntries, sortColIdx],
  );

  const ignoredCount = headers.filter((h) => columnRoles[h] === 'ignore').length;

  const flexColumnVi = useMemo(() => {
    const byRole = visibleIndices.findIndex((ci) =>
      isDescriptionLikeColumn(headers[ci]!, columnRoles[headers[ci]!]),
    );
    if (byRole >= 0) return byRole;

    let bestVi = visibleIndices.length - 1;
    let bestChars = 0;
    visibleIndices.forEach((ci, vi) => {
      let maxChars = headers[ci]!.length;
      for (const row of rows) {
        maxChars = Math.max(maxChars, (row[ci] ?? '').length);
      }
      if (maxChars > bestChars) {
        bestChars = maxChars;
        bestVi = vi;
      }
    });
    return bestVi;
  }, [headers, rows, visibleIndices, columnRoles]);

  const columnWidths = useMemo(
    () =>
      visibleIndices.map((ci, vi) =>
        autoColumnWidthPx(
          headers[ci]!,
          rows,
          ci,
          vi === 0 ? ` ${rows.length} righe`.length : 0,
          vi === flexColumnVi ? Number.POSITIVE_INFINITY : FIXED_COLUMN_MAX_PX,
        ),
      ),
    [headers, rows, visibleIndices, flexColumnVi],
  );

  const handleRoleChange = async (colName: string, role: ColumnRole) => {
    const previousRoles = columnRoles;
    const newRoles = { ...columnRoles };
    if (newRoles[colName] === role) {
      delete newRoles[colName];
    } else {
      if (role === 'description') {
        for (const h of Object.keys(newRoles)) {
          if (h !== colName && newRoles[h] === 'description') delete newRoles[h];
        }
      }
      newRoles[colName] = role;
    }
    setColumnRoles(newRoles);
    try {
      const fresh = await persistDocumentColumnRoles(doc.id, newRoles);
      onDocUpdated?.(fresh);
    } catch {
      setColumnRoles(previousRoles);
    }
  };

  const handleDeleteRow = useCallback(async (sourceIndex: number) => {
    const row = rows[sourceIndex];
    if (!row) return;

    const label = (row[sortColIdx] ?? '').trim() || `riga ${sourceIndex + 1}`;
    if (!window.confirm(`Eliminare "${label}" dal documento originale?`)) return;

    const nextTabular: ParsedTabular = {
      headers: localTabular.headers,
      rows: localTabular.rows.filter((_, idx) => idx !== sourceIndex),
    };

    setDeleteError(null);
    setDeletingSourceIndex(sourceIndex);
    try {
      const freshDoc = await persistTabularDocument(doc, nextTabular, {
        csvSeparator: csvSeparator ?? undefined,
      });
      setLocalTabular(nextTabular);
      onTabularChange?.(nextTabular);
      onDocUpdated?.(freshDoc);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Eliminazione fallita');
    } finally {
      setDeletingSourceIndex(null);
    }
  }, [csvSeparator, doc, localTabular.headers, localTabular.rows, onDocUpdated, onTabularChange, rows, sortColIdx]);

  const startCellEdit = useCallback((sourceIndex: number, colIndex: number) => {
    const value = rows[sourceIndex]?.[colIndex] ?? '';
    setSaveError(null);
    setEditingCell({ sourceIndex, colIndex });
    setCellDraft(value);
  }, [rows]);

  const cancelCellEdit = useCallback(() => {
    setEditingCell(null);
    setCellDraft('');
  }, []);

  const handleSaveCell = useCallback(async () => {
    if (!editingCell) return;
    const { sourceIndex, colIndex } = editingCell;
    const previousValue = rows[sourceIndex]?.[colIndex] ?? '';
    if (cellDraft === previousValue) {
      cancelCellEdit();
      return;
    }

    const nextRows = localTabular.rows.map((row, rowIdx) =>
      rowIdx === sourceIndex
        ? row.map((cell, cellIdx) => (cellIdx === colIndex ? cellDraft : cell))
        : row,
    );
    const nextTabular: ParsedTabular = {
      headers: localTabular.headers,
      rows: nextRows,
    };

    setSaveError(null);
    setSavingCell({ sourceIndex, colIndex });
    try {
      const freshDoc = await persistTabularDocument(doc, nextTabular, {
        csvSeparator: csvSeparator ?? undefined,
      });
      setLocalTabular(nextTabular);
      onTabularChange?.(nextTabular);
      onDocUpdated?.(freshDoc);
      cancelCellEdit();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Salvataggio fallito');
    } finally {
      setSavingCell(null);
    }
  }, [
    cancelCellEdit,
    cellDraft,
    csvSeparator,
    doc,
    editingCell,
    localTabular.headers,
    localTabular.rows,
    onDocUpdated,
    onTabularChange,
    rows,
  ]);

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0 w-full max-w-full overflow-hidden">
      {/* Filter bar */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-[#1a3a2a] bg-[#0a1510]">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="filter rows…"
          className="flex-1 min-w-0 bg-transparent border border-[#1a3a2a] rounded px-2 py-0.5 font-mono text-xs text-emerald-300 placeholder-emerald-400/30 focus:outline-none focus:border-emerald-400/50"
        />
        {ignoredCount > 0 && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-2 py-0.5 rounded border font-mono text-xs transition-colors ${
              showAll
                ? 'border-emerald-400/40 text-emerald-300 bg-emerald-400/10'
                : 'border-[#1a3a2a] text-emerald-400/40 hover:text-emerald-400/70'
            }`}
          >
            {showAll ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {showAll ? 'Nascondi escluse' : `+${ignoredCount} escluse`}
          </button>
        )}
        {deleteError && (
          <span className="flex-shrink-0 font-mono text-[10px] text-red-400">{deleteError}</span>
        )}
        {saveError && (
          <span className="flex-shrink-0 font-mono text-[10px] text-red-400">{saveError}</span>
        )}
        <span className="flex-shrink-0 font-mono text-[10px] text-emerald-400/45 hidden sm:inline">
          Doppio click su una cella per modificare
        </span>
      </div>

      {/* Table — h-0 + flex-1 forces scroll inside viewport instead of expanding the page */}
      <div className="flex-1 min-h-0 h-0 min-w-0 w-full max-w-full overflow-auto overscroll-contain">
        <table className="text-left border-collapse w-full table-fixed">
          <colgroup>
            <col style={{ width: 40 }} />
            {visibleIndices.map((ci, vi) => (
              <col
                key={ci}
                style={
                  vi === flexColumnVi
                    ? { minWidth: columnWidths[vi] }
                    : { width: columnWidths[vi] }
                }
              />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-[#1a3a2a]">
              <th className="px-1 py-2 font-mono text-[10px] uppercase tracking-wider text-emerald-400/40 border-r border-[#1a3a2a] bg-[#0a1510] w-10" />
              {visibleIndices.map((ci, vi) => {
                const h = headers[ci]!;
                const role = columnRoles[h];
                const cfg = role ? ROLE_CONFIG[role] : null;

                return (
                  <ColumnHeader
                    key={ci}
                    header={h}
                    isFirstVisible={ci === visibleIndices[0]}
                    role={role}
                    cfg={cfg}
                    width={columnWidths[vi]!}
                    isFlexColumn={vi === flexColumnVi}
                    rowCountLabel={filter ? `${filteredEntries.length}/${rows.length} righe` : `${rows.length} righe`}
                    isToolbarOpen={openToolbarCol === h}
                    onOpenToolbar={() => openToolbar(h)}
                    onScheduleCloseToolbar={scheduleCloseToolbar}
                    onRoleChange={(r) => void handleRoleChange(h, r)}
                  />
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedEntries.map(({ row, sourceIndex }, ri) => (
              <tr
                key={sourceIndex}
                className={`border-b border-[#111] hover:brightness-110 transition-colors ${
                  ri % 2 === 0 ? 'bg-[#0d0d0d]' : 'bg-[#0f0f0f]'
                }`}
              >
                <td className="px-1 py-1.5 border-r border-[#111] text-center align-middle w-10">
                  <button
                    type="button"
                    title="Elimina riga dal documento"
                    disabled={deletingSourceIndex !== null}
                    onClick={() => void handleDeleteRow(sourceIndex)}
                    className="inline-flex items-center justify-center w-7 h-7 rounded border border-transparent text-red-400/45 hover:text-red-300 hover:border-red-400/30 hover:bg-red-400/10 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  >
                    {deletingSourceIndex === sourceIndex ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </td>
                {visibleIndices.map((ci, vi) => {
                  const h = headers[ci]!;
                  const role = columnRoles[h];
                  const cfg = role ? ROLE_CONFIG[role] : null;
                  const cell = row[ci] ?? '';
                  const isFlexColumn = vi === flexColumnVi;
                  const isEditing = editingCell?.sourceIndex === sourceIndex && editingCell.colIndex === ci;
                  const isSaving = savingCell?.sourceIndex === sourceIndex && savingCell.colIndex === ci;
                  return (
                    <TabularCell
                      key={ci}
                      cell={cell}
                      isFlexColumn={isFlexColumn}
                      width={columnWidths[vi]!}
                      role={role}
                      cfg={cfg}
                      isEditing={isEditing}
                      draftValue={isEditing ? cellDraft : cell}
                      isSaving={isSaving}
                      onDraftChange={setCellDraft}
                      onStartEdit={() => startCellEdit(sourceIndex, ci)}
                      onSave={() => void handleSaveCell()}
                      onCancel={cancelCellEdit}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {filteredEntries.length === 0 && (
          <div className="flex items-center justify-center py-12 text-emerald-400/30 font-mono text-sm">
            no matching rows
          </div>
        )}
      </div>
    </div>
  );
}
