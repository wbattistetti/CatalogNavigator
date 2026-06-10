/**
 * Pick which tabular column holds the item description text.
 */
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { suggestDescriptionColumn } from '../../lib/columnRoles';
import type { ColumnRole } from '../../lib/supabase';

interface DescriptionColumnSelectProps {
  headers: string[];
  columnRoles?: Record<string, ColumnRole>;
  value: string | null;
  onConfirm: (column: string) => void | Promise<void>;
  disabled?: boolean;
  /** Full-page empty state vs compact inline control */
  variant?: 'empty' | 'inline';
}

export function DescriptionColumnSelect({
  headers,
  columnRoles = {},
  value,
  onConfirm,
  disabled = false,
  variant = 'empty',
}: DescriptionColumnSelectProps) {
  const [selected, setSelected] = useState(() =>
    value ?? suggestDescriptionColumn(headers, columnRoles),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (value) setSelected(value);
    else setSelected(suggestDescriptionColumn(headers, columnRoles));
  }, [value, headers, columnRoles]);

  const handleConfirm = async () => {
    if (!selected || disabled || saving) return;
    setSaving(true);
    try {
      await onConfirm(selected);
    } finally {
      setSaving(false);
    }
  };

  const selectEl = (
    <select
      value={selected}
      onChange={(e) => {
        const next = e.target.value;
        setSelected(next);
        if (variant === 'inline') void onConfirm(next);
      }}
      disabled={disabled || saving || headers.length === 0}
      className="font-mono text-xs bg-[#0a1510] border border-[#1a3a2a] rounded px-2 py-1.5 text-emerald-300 focus:outline-none focus:border-amber-400/50 disabled:opacity-40"
    >
      {headers.map((h) => (
        <option key={h} value={h}>{h}</option>
      ))}
    </select>
  );

  if (headers.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 max-w-md text-center px-4">
        <p className="font-mono text-sm text-amber-300/90 leading-relaxed">
          Nessuna colonna rilevata nel file. Verifica che la prima riga contenga le intestazioni.
        </p>
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <div className="flex items-center gap-2 ml-auto">
        <span className="font-mono text-[10px] text-emerald-400/40">Colonna descrizione</span>
        {selectEl}
        {saving && <Loader2 className="w-3 h-3 animate-spin text-emerald-400/50" />}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 max-w-md text-center">
      <p className="font-mono text-sm text-emerald-400/50 leading-relaxed">
        Nessuna colonna descrizione configurata. Scegli quale colonna contiene il testo
        descrittivo di ogni item — non deve chiamarsi necessariamente &quot;Descrizione&quot;.
      </p>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
        {selectEl}
        <button
          type="button"
          onClick={() => void handleConfirm()}
          disabled={!selected || disabled || saving}
          className="flex items-center justify-center gap-1.5 px-4 py-1.5 font-mono text-xs font-semibold text-emerald-900 bg-amber-400 rounded hover:bg-amber-300 transition-colors disabled:opacity-40"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          Usa questa colonna
        </button>
      </div>
    </div>
  );
}
