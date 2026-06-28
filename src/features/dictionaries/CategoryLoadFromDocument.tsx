/**
 * Empty-category control: pick a document column and import distinct values as tokens.
 */
import { memo, useCallback, useEffect, useState } from 'react';
import { LOAD_FROM_COLUMN_CONFIRM_THRESHOLD } from '../../lib/loadCategoryFromDocumentColumn';

const TREE_LABEL = 'font-mono text-xs';

export interface CategoryLoadFromDocumentProps {
  columns: string[];
  countValuesInColumn: (columnName: string) => number;
  onImport: (columnName: string) => void;
  onFeedback: (message: { kind: 'error' | 'info'; text: string } | null) => void;
}

export const CategoryLoadFromDocument = memo(function CategoryLoadFromDocument({
  columns,
  countValuesInColumn,
  onImport,
  onFeedback,
}: CategoryLoadFromDocumentProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingColumn, setPendingColumn] = useState<string | null>(null);

  useEffect(() => {
    setPickerOpen(false);
    setPendingColumn(null);
    onFeedback(null);
  }, [columns, onFeedback]);

  const runImport = useCallback((columnName: string) => {
    const count = countValuesInColumn(columnName);
    if (count === 0) {
      onFeedback({ kind: 'error', text: 'Nessun valore in questa colonna.' });
      setPickerOpen(false);
      return;
    }
    if (count > LOAD_FROM_COLUMN_CONFIRM_THRESHOLD) {
      setPendingColumn(columnName);
      setPickerOpen(false);
      return;
    }
    onImport(columnName);
    setPickerOpen(false);
    onFeedback(null);
  }, [countValuesInColumn, onFeedback, onImport]);

  const handleConfirmLargeImport = useCallback(() => {
    if (!pendingColumn) return;
    onImport(pendingColumn);
    setPendingColumn(null);
    onFeedback(null);
  }, [onImport, onFeedback, pendingColumn]);

  if (columns.length === 0) return null;

  if (pendingColumn) {
    const count = countValuesInColumn(pendingColumn);
    return (
      <div className="mt-3 px-2 space-y-2">
        <p className={`${TREE_LABEL} text-amber-200/90 leading-relaxed`}>
          Importare {count} voci dalla colonna «{pendingColumn}»?
        </p>
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            className={`${TREE_LABEL} px-2 py-1 rounded border border-amber-400/50 text-amber-100 hover:bg-amber-400/15`}
            onClick={handleConfirmLargeImport}
          >
            Importa
          </button>
          <button
            type="button"
            className={`${TREE_LABEL} px-2 py-1 rounded border border-[#1a3a2a] text-emerald-300/80 hover:bg-[#1a3a2a]/40`}
            onClick={() => setPendingColumn(null)}
          >
            Annulla
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2">
      {!pickerOpen ? (
        <button
          type="button"
          className={`${TREE_LABEL} text-amber-300 hover:text-amber-200 underline decoration-amber-400/60`}
          onClick={() => {
            setPickerOpen(true);
            onFeedback(null);
          }}
        >
          carica dal documento
        </button>
      ) : (
        <select
          autoFocus
          defaultValue=""
          className={`${TREE_LABEL} bg-[#0a1510] border border-[#1a3a2a] rounded px-2 py-1 text-amber-300 focus:outline-none focus:border-amber-400/50 max-w-full`}
          onChange={(e) => {
            const col = e.target.value;
            if (col) runImport(col);
          }}
          onBlur={() => setPickerOpen(false)}
        >
          <option value="" disabled>Scegli colonna…</option>
          {columns.map((h) => (
            <option key={h} value={h}>{h}</option>
          ))}
        </select>
      )}
    </div>
  );
});
