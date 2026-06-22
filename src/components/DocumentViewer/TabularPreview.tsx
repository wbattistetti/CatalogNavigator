/**
 * Tabular document preview — Glide canvas grid (11k+ rows, flat text cells).
 */
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { ColumnRole, KbDocument } from '../../lib/supabase';
import { persistDocumentColumnRoles } from '../../lib/columnRoles';
import { persistTabularDocument } from '../../lib/persistTabularDocument';
import type { ParsedTabular } from '../../lib/parseTabular';
import { TABULAR_ROLE_CONFIG, TABULAR_ROLES } from './tabularRoleConfig';
import { buildDisplayRowModel } from './tabularDisplayRows';
import { autoColumnWidthPx, sampleRowsForWidth } from './tabularLayout';
import { TabularGlideGrid } from './TabularGlideGrid';

interface TabularPreviewProps {
  doc: KbDocument;
  tabular: ParsedTabular;
  csvSeparator?: '\t' | ';' | ',' | null;
  initialRoles?: Record<string, ColumnRole>;
  onDocUpdated?: (doc: KbDocument) => void;
  onTabularChange?: (tabular: ParsedTabular) => void;
}

const TOOLBAR_HIDE_DELAY_MS = 320;

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
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const hideToolbarTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localTabularRef = useRef(localTabular);
  localTabularRef.current = localTabular;

  useEffect(() => { setLocalTabular(tabular); }, [tabular, doc.id]);
  useEffect(() => { setColumnRoles(initialRoles); }, [initialRoles, doc.id]);
  useEffect(() => () => {
    if (hideToolbarTimer.current) clearTimeout(hideToolbarTimer.current);
  }, []);

  const deferredFilter = useDeferredValue(filter);

  const visibleIndices = useMemo(
    () =>
      headers.reduce<number[]>((acc, h, i) => {
        if (!showAll && columnRoles[h] === 'ignore') return acc;
        acc.push(i);
        return acc;
      }, []),
    [headers, showAll, columnRoles],
  );

  const displayRowCount = useMemo(
    () => buildDisplayRowModel(rows.length, rows, visibleIndices, deferredFilter).count,
    [rows, visibleIndices, deferredFilter, rows.length],
  );

  const ignoredCount = useMemo(
    () => headers.filter((h) => columnRoles[h] === 'ignore').length,
    [headers, columnRoles],
  );

  const scheduleCloseToolbar = useCallback(() => {
    if (hideToolbarTimer.current) clearTimeout(hideToolbarTimer.current);
    hideToolbarTimer.current = setTimeout(() => {
      setOpenToolbarCol(null);
      hideToolbarTimer.current = null;
    }, TOOLBAR_HIDE_DELAY_MS);
  }, []);

  const handleHeaderClicked = useCallback((headerName: string) => {
    if (hideToolbarTimer.current) {
      clearTimeout(hideToolbarTimer.current);
      hideToolbarTimer.current = null;
    }
    setOpenToolbarCol((prev) => (prev === headerName ? null : headerName));
  }, []);

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
    setOpenToolbarCol(null);
    try {
      const fresh = await persistDocumentColumnRoles(doc.id, newRoles);
      onDocUpdated?.(fresh);
    } catch {
      setColumnRoles(previousRoles);
    }
  };

  const handleCellEdited = useCallback(async (
    sourceRowIndex: number,
    sourceColIndex: number,
    value: string,
  ) => {
    const tab = localTabularRef.current;
    const previousValue = tab.rows[sourceRowIndex]?.[sourceColIndex] ?? '';
    if (value === previousValue) return;

    const nextRows = tab.rows.map((row, rowIdx) =>
      rowIdx === sourceRowIndex
        ? row.map((cell, cellIdx) => (cellIdx === sourceColIndex ? value : cell))
        : row,
    );
    const nextTabular: ParsedTabular = { headers: tab.headers, rows: nextRows };

    setSaveError(null);
    try {
      const freshDoc = await persistTabularDocument(doc, nextTabular, {
        csvSeparator: csvSeparator ?? undefined,
      });
      setLocalTabular(nextTabular);
      onTabularChange?.(nextTabular);
      onDocUpdated?.(freshDoc);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Salvataggio fallito');
    }
  }, [csvSeparator, doc, onDocUpdated, onTabularChange]);

  const handleDeleteRows = useCallback(async (sourceIndices: number[]) => {
    const tab = localTabularRef.current;
    const unique = [...new Set(sourceIndices)];
    if (unique.length === 0) return;

    const label = unique.length === 1
      ? `riga ${unique[0]! + 1}`
      : `${unique.length} righe`;
    if (!window.confirm(`Eliminare ${label} dal documento originale?`)) return;

    const toRemove = new Set(unique);
    const nextTabular: ParsedTabular = {
      headers: tab.headers,
      rows: tab.rows.filter((_, idx) => !toRemove.has(idx)),
    };

    setDeleteError(null);
    try {
      const freshDoc = await persistTabularDocument(doc, nextTabular, {
        csvSeparator: csvSeparator ?? undefined,
      });
      setLocalTabular(nextTabular);
      onTabularChange?.(nextTabular);
      onDocUpdated?.(freshDoc);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Eliminazione fallita');
    }
  }, [csvSeparator, doc, onDocUpdated, onTabularChange]);

  const widthSampleRows = useMemo(() => sampleRowsForWidth(rows), [rows]);

  const glideColumns = useMemo(
    () =>
      visibleIndices.map((ci, vi) => ({
        title: headers[ci] ?? '',
        id: headers[ci] ?? String(ci),
        width: autoColumnWidthPx(headers[ci] ?? '', widthSampleRows, ci),
        grow: vi === visibleIndices.length - 1 ? 1 : undefined,
      })),
    [visibleIndices, headers, widthSampleRows],
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0 w-full max-w-full overflow-hidden">
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-[#1a3a2a] bg-[#0a1510]">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtra righe…"
          className="flex-1 min-w-0 bg-transparent border border-[#1a3a2a] rounded px-2 py-0.5 font-mono text-xs text-emerald-300 placeholder-emerald-400/30 focus:outline-none focus:border-emerald-400/50"
        />
        <span className="flex-shrink-0 font-mono text-[10px] text-emerald-400/60 tabular-nums">
          {displayRowCount.toLocaleString('it-IT')} / {rows.length.toLocaleString('it-IT')}
        </span>
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
        <span className="flex-shrink-0 font-mono text-[10px] text-emerald-400/45 hidden lg:inline">
          Click header → ruolo · doppio click cella → espandi/copia · selezione righe + Delete
        </span>
      </div>

      {openToolbarCol && (
        <div
          className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-[#1a3a2a] bg-[#0a1510]"
          onMouseLeave={scheduleCloseToolbar}
        >
          <span className="font-mono text-[10px] text-emerald-400/50 uppercase">{openToolbarCol}</span>
          <div className="flex items-center gap-0.5">
            {TABULAR_ROLES.map((r) => {
              const rcfg = TABULAR_ROLE_CONFIG[r];
              const isActive = columnRoles[openToolbarCol] === r;
              return (
                <button
                  key={r}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    void handleRoleChange(openToolbarCol, r);
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

      <div className="flex flex-col flex-1 min-h-0 min-w-0 w-full overflow-hidden">
        <TabularGlideGrid
          headers={headers}
          rows={rows}
          visibleColumnIndices={visibleIndices}
          columnRoles={columnRoles}
          columns={glideColumns}
          filter={deferredFilter}
          rowCount={rows.length}
          onCellEdited={handleCellEdited}
          onDeleteRows={handleDeleteRows}
          onHeaderClicked={handleHeaderClicked}
        />
      </div>
    </div>
  );
}
