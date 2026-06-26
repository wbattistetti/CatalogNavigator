/**
 * Readable catalog editor: original corpus text vs spoken confirmation phrase per leaf path.
 */
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import {
  readableCatalogTextColor,
  readableCatalogKey,
  type ReadableCatalogRow,
} from '../../lib/readableCatalog';
import type { RowStatus } from '../../lib/analysisTypes';
import { useReadableCatalogRows } from './useReadableCatalogRows';

const ROW_GRID =
  'grid grid-cols-[2rem_minmax(16rem,2fr)_minmax(16rem,2fr)_4.5rem]';
const TABLE_MIN_WIDTH = 'min-w-[56rem]';

function AutoResizeTextarea({
  value,
  onChange,
  onBlur,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  className: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const syncHeight = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useLayoutEffect(() => {
    syncHeight();
  }, [value, syncHeight]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      rows={1}
      style={{ overflow: 'hidden' }}
      className={className}
    />
  );
}

function ReadableCatalogRowEditor({
  rowIndex,
  row,
  onTextCommit,
  onStatusChange,
}: {
  rowIndex: number;
  row: ReadableCatalogRow;
  onTextCommit: (sourceText: string, text: string) => void;
  onStatusChange: (sourceText: string, status: RowStatus, text?: string) => void;
}) {
  const [draft, setDraft] = useState(row.text);

  useEffect(() => {
    setDraft(row.text);
  }, [row.text]);

  const commitDraft = useCallback(() => {
    if (draft.trim() !== row.text.trim()) {
      onTextCommit(row.sourceText, draft);
    }
  }, [draft, onTextCommit, row.sourceText, row.text]);

  return (
    <div className={`${ROW_GRID} items-start border-b border-[#111] hover:bg-[#0f1a12]`}>
      <span className="font-mono text-[9px] text-emerald-300/70 pt-2.5 text-center tabular-nums">
        {rowIndex + 1}
      </span>
      <div className="min-w-0 px-3 py-2">
        <p className="font-mono text-xs text-emerald-200/75 leading-relaxed break-words whitespace-pre-wrap select-text">
          {row.sourceText}
        </p>
        <p className="mt-1 font-mono text-[9px] text-emerald-400/35 break-all">
          {row.path}
        </p>
      </div>
      <div className="min-w-0 px-3 py-2 border-l border-[#1a3a2a]">
        <AutoResizeTextarea
          value={draft}
          onChange={setDraft}
          onBlur={commitDraft}
          className={`w-full resize-none bg-[#0a1510] border border-[#1a3a2a] rounded px-2 py-1.5 font-mono text-xs leading-relaxed focus:outline-none focus:border-emerald-400/40 ${readableCatalogTextColor(row.status)}`}
        />
      </div>
      <div className="flex flex-col items-center gap-1 pt-2.5">
        <button
          type="button"
          title="Validato"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const text = draft.trim() || row.sourceText;
            onStatusChange(
              row.sourceText,
              row.status === 'approved' ? null : 'approved',
              text,
            );
          }}
          className={`p-0.5 rounded transition-colors ${
            row.status === 'approved'
              ? 'text-emerald-400'
              : 'text-emerald-400/35 hover:text-emerald-400'
          }`}
        >
          <ThumbsUp className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          title="Da aggiustare"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onStatusChange(
              row.sourceText,
              row.status === 'rejected' ? null : 'rejected',
            );
          }}
          className={`p-0.5 rounded transition-colors ${
            row.status === 'rejected'
              ? 'text-red-400'
              : 'text-red-400/35 hover:text-red-400'
          }`}
        >
          <ThumbsDown className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

const MemoReadableCatalogRowEditor = memo(
  ReadableCatalogRowEditor,
  (prev, next) => (
    prev.rowIndex === next.rowIndex
    && prev.row.path === next.row.path
    && prev.row.text === next.row.text
    && prev.row.status === next.row.status
    && prev.row.sourceText === next.row.sourceText
  ),
);

export function ReadableCatalogWorkspace() {
  const {
    rows,
    hasTaxonomy,
    pendingCount,
    totalCount,
    updateReadableCatalogEntry,
  } = useReadableCatalogRows();
  const [pendingOnly, setPendingOnly] = useState(false);

  const visibleRows = useMemo(
    () => (pendingOnly ? rows.filter((row) => row.status !== 'approved') : rows),
    [pendingOnly, rows],
  );

  const handleTextCommit = useCallback((
    sourceText: string,
    text: string,
  ) => {
    updateReadableCatalogEntry(sourceText, { text });
  }, [updateReadableCatalogEntry]);

  const handleStatusChange = useCallback((
    sourceText: string,
    status: RowStatus,
    text?: string,
  ) => {
    const row = rows.find((r) => r.sourceText === sourceText);
    updateReadableCatalogEntry(
      sourceText,
      { status, text: text ?? row?.text },
    );
  }, [rows, updateReadableCatalogEntry]);

  if (!hasTaxonomy) {
    return (
      <div className="flex items-center justify-center h-full text-emerald-400/30 font-mono text-sm px-8 text-center">
        Genera l&apos;ontologia prima di curare il catalogo leggibile.
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-emerald-400/30 font-mono text-sm px-8 text-center">
        Nessuna voce catalogo segmentata.
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden bg-[#0a0f0c]">
      <header className="flex-shrink-0 px-4 py-3 border-b border-[#1a3a2a] bg-[#0a1510] space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-mono text-sm font-semibold text-emerald-100 uppercase tracking-wide">
              Catalogo leggibile
            </h2>
            <p className="font-mono text-xs text-emerald-300/65 mt-1 max-w-3xl">
              Colonna Originale = descrizione dal documento (es. NOME_VISITA). Arancione = da revisionare,
              verde = validato. Il path sotto ogni riga è solo per debug.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-orange-300/85 tabular-nums">
              {pendingCount} / {totalCount} da revisionare
            </span>
            <label className="flex items-center gap-1.5 font-mono text-xs text-emerald-300/75 cursor-pointer">
              <input
                type="checkbox"
                checked={pendingOnly}
                onChange={(e) => setPendingOnly(e.target.checked)}
                className="rounded border-[#1a3a2a] bg-[#0a1510] text-amber-400 focus:ring-amber-400/40"
              />
              Solo da revisionare
            </label>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-auto overscroll-contain">
        <div className={`${TABLE_MIN_WIDTH} w-full`}>
          <div
            className={`sticky top-0 z-10 ${ROW_GRID} items-center border-b border-[#1a3a2a] bg-[#0a1510]`}
          >
            <span className="px-1 py-2 font-mono text-[9px] text-emerald-400/70 uppercase text-center">#</span>
            <span className="px-3 py-2 font-mono text-[10px] text-emerald-300/85 uppercase tracking-wider">
              Originale
            </span>
            <span className="px-3 py-2 border-l border-[#1a3a2a] font-mono text-[10px] text-amber-300/85 uppercase tracking-wider">
              Leggibile
            </span>
            <span className="px-1 py-2 font-mono text-[9px] text-emerald-400/50 uppercase text-center">
              OK
            </span>
          </div>

          {visibleRows.map((row, rowIndex) => (
            <MemoReadableCatalogRowEditor
              key={readableCatalogKey(row.sourceText) || `${rowIndex}`}
              rowIndex={rowIndex}
              row={row}
              onTextCommit={handleTextCommit}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
