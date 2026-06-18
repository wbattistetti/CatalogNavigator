/**
 * Pick which tabular columns contribute text to the ontology corpus (multi-select).
 */
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import type { ColumnRole } from '../../lib/supabase';
import { suggestOntologyColumns } from '../../lib/columnRoles';

interface OntologyColumnsSelectProps {
  headers: string[];
  columnRoles?: Record<string, ColumnRole>;
  value: string[];
  onConfirm: (columns: string[]) => void | Promise<void>;
  disabled?: boolean;
  /** Full-page empty state vs compact popover control */
  variant?: 'empty' | 'inline';
}

export function OntologyColumnsSelect({
  headers,
  columnRoles = {},
  value,
  onConfirm,
  disabled = false,
  variant = 'empty',
}: OntologyColumnsSelectProps) {
  const [selected, setSelected] = useState<string[]>(() =>
    value.length > 0 ? value : suggestOntologyColumns(headers, columnRoles),
  );
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value.length > 0) setSelected(value);
    else setSelected(suggestOntologyColumns(headers, columnRoles));
  }, [value, headers, columnRoles]);

  useEffect(() => {
    if (!open || variant !== 'inline') return;
    const onPointerDown = (event: MouseEvent) => {
      if (!popoverRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open, variant]);

  const toggleColumn = (column: string) => {
    setSelected((prev) => (
      prev.includes(column)
        ? prev.filter((c) => c !== column)
        : [...prev, column]
    ));
  };

  const handleConfirm = async () => {
    if (selected.length === 0 || disabled || saving) return;
    setSaving(true);
    try {
      await onConfirm(selected);
      if (variant === 'inline') setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const listEl = (
    <ul className="max-h-64 overflow-y-auto scrollbar-thin divide-y divide-[#1a3a2a]/60">
      {headers.map((header) => {
        const checked = selected.includes(header);
        return (
          <li key={header}>
            <label
              className={`flex items-center gap-2 px-3 py-2 cursor-pointer font-mono text-xs transition-colors ${
                checked
                  ? 'text-emerald-200 bg-emerald-400/8'
                  : 'text-emerald-400/70 hover:bg-white/5'
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleColumn(header)}
                disabled={disabled || saving}
                className="rounded border-[#1a3a2a] bg-[#0a1510] text-amber-400 focus:ring-amber-400/40"
              />
              <span className="truncate" title={header}>{header}</span>
            </label>
          </li>
        );
      })}
    </ul>
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
      <div className="relative ml-auto" ref={popoverRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={disabled || saving}
          className="flex items-center gap-1.5 font-mono text-xs bg-[#0a1510] border border-[#1a3a2a] rounded px-2 py-1.5 text-emerald-300 hover:border-amber-400/40 disabled:opacity-40 transition-colors"
          title="Colonne usate per costruire il testo ontologia"
        >
          <span className="text-emerald-400/40">Colonne ontologia</span>
          <span className="tabular-nums text-amber-300/90">{selected.length}</span>
          <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
          {saving && <Loader2 className="w-3 h-3 animate-spin text-emerald-400/50" />}
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1 z-30 w-72 rounded border border-[#1a3a2a] bg-[#0a1510] shadow-xl overflow-hidden">
            <div className="px-3 py-2 border-b border-[#1a3a2a] font-mono text-[10px] text-emerald-400/50">
              Seleziona le colonne da unire per ogni riga
            </div>
            {listEl}
            <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-[#1a3a2a] bg-[#070d09]">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-2 py-1 font-mono text-[10px] text-emerald-400/50 hover:text-emerald-300"
              >
                Chiudi
              </button>
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={selected.length === 0 || disabled || saving}
                className="flex items-center gap-1 px-3 py-1 font-mono text-[10px] font-semibold text-emerald-900 bg-amber-400 rounded hover:bg-amber-300 disabled:opacity-40"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Applica
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 max-w-lg w-full text-center">
      <p className="font-mono text-sm text-emerald-400/50 leading-relaxed px-4">
        Scegli una o più colonne da includere nel testo ontologia. Per ogni riga, i valori
        selezionati vengono uniti in un unico testo descrittivo.
      </p>
      <div className="w-full rounded border border-[#1a3a2a] bg-[#0a1510] overflow-hidden text-left">
        {listEl}
      </div>
      <button
        type="button"
        onClick={() => void handleConfirm()}
        disabled={selected.length === 0 || disabled || saving}
        className="flex items-center justify-center gap-1.5 px-4 py-1.5 font-mono text-xs font-semibold text-emerald-900 bg-amber-400 rounded hover:bg-amber-300 transition-colors disabled:opacity-40"
      >
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
        Usa {selected.length} colonna{selected.length === 1 ? '' : 'e'}
      </button>
    </div>
  );
}
