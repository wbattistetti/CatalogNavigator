import React, { useState } from 'react';
import { ChevronUp, ChevronDown, Check, Sparkles, Layers, ArrowRight } from 'lucide-react';

interface FieldSelectorProps {
  fields: string[];
  onConfirm: (orderedSelected: string[]) => void;
  onCancel: () => void;
}

interface FieldItem {
  name: string;
  selected: boolean;
}

export function FieldSelector({ fields, onConfirm, onCancel }: FieldSelectorProps) {
  const [items, setItems] = useState<FieldItem[]>(
    fields.map((f) => ({ name: f, selected: true })),
  );

  const selectedItems = items.filter((i) => i.selected);

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    setItems((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx]!, next[idx - 1]!];
      return next;
    });
  };

  const moveDown = (idx: number) => {
    if (idx === items.length - 1) return;
    setItems((prev) => {
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1]!, next[idx]!];
      return next;
    });
  };

  const toggle = (idx: number) =>
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, selected: !item.selected } : item)));

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex-shrink-0 px-5 py-4 border-b border-[#1a3a2a] bg-[#070d09]">
        <div className="flex items-center gap-2 mb-1">
          <Layers className="w-4 h-4 text-emerald-400/70" />
          <h3 className="font-mono text-sm font-semibold text-emerald-300">
            Configura la struttura dell'agente
          </h3>
        </div>
        <p className="font-mono text-xs text-emerald-400/50 leading-relaxed">
          Seleziona i campi rilevanti e riordinali.{' '}
          <span className="text-emerald-400/70">Il primo campo e' la radice</span>, l'ultimo e' la foglia.
        </p>
      </div>

      {/* Field list */}
      <div className="flex-1 min-h-0 overflow-auto px-5 py-4 space-y-1.5">
        {items.map((item, idx) => {
          const rank = selectedItems.findIndex((si) => si.name === item.name);
          const isFirst = rank === 0;
          const isLast = rank === selectedItems.length - 1 && selectedItems.length > 1;

          return (
            <div
              key={item.name}
              className={`flex items-center gap-3 px-3 py-2.5 rounded border transition-all ${
                item.selected ? 'border-emerald-400/30 bg-[#0a1a10]' : 'border-[#1a3a2a] bg-[#0a0a0a] opacity-40'
              }`}
            >
              {/* Up/Down */}
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => moveUp(idx)}
                  disabled={idx === 0}
                  className="p-0.5 text-emerald-400/30 hover:text-emerald-400/80 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => moveDown(idx)}
                  disabled={idx === items.length - 1}
                  className="p-0.5 text-emerald-400/30 hover:text-emerald-400/80 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Checkbox */}
              <button
                onClick={() => toggle(idx)}
                className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-all ${
                  item.selected ? 'bg-emerald-400 border-emerald-400' : 'bg-transparent border-emerald-400/30 hover:border-emerald-400/60'
                }`}
              >
                {item.selected && <Check className="w-2.5 h-2.5 text-emerald-900" />}
              </button>

              {/* Rank badge */}
              {rank !== -1 ? (
                <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center font-mono text-[10px] font-bold border ${
                  isFirst ? 'bg-emerald-400/20 text-emerald-300 border-emerald-400/40' : 'bg-[#0f1f14] text-emerald-400/50 border-[#1a3a2a]'
                }`}>
                  {rank + 1}
                </span>
              ) : (
                <span className="flex-shrink-0 w-5 h-5" />
              )}

              {/* Name */}
              <span className={`flex-1 font-mono text-sm ${item.selected ? 'text-emerald-200' : 'text-emerald-400/40'}`}>
                {item.name}
              </span>

              {/* Level label */}
              {rank !== -1 && (
                <span className="flex-shrink-0 font-mono text-[10px] text-emerald-400/30">
                  {isFirst ? 'radice' : isLast ? 'foglia' : `liv. ${rank + 1}`}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Preview + actions */}
      <div className="flex-shrink-0 border-t border-[#1a3a2a] px-5 py-3 bg-[#070d09]">
        <p className="font-mono text-[10px] text-emerald-400/40 uppercase tracking-widest mb-1.5">
          Anteprima percorso ({selectedItems.length} livell{selectedItems.length === 1 ? 'o' : 'i'})
        </p>
        <div className="flex items-center gap-1 flex-wrap mb-3 min-h-[22px]">
          {selectedItems.length > 0 ? selectedItems.map((item, i) => (
            <React.Fragment key={item.name}>
              <span className={`font-mono text-xs px-2 py-0.5 rounded border ${
                i === 0 ? 'text-emerald-300 border-emerald-400/40 bg-emerald-400/10' : 'text-emerald-400/60 border-[#1a3a2a] bg-[#0a1510]'
              }`}>
                {item.name}
              </span>
              {i < selectedItems.length - 1 && <ArrowRight className="w-3 h-3 text-emerald-400/25 flex-shrink-0" />}
            </React.Fragment>
          )) : (
            <span className="font-mono text-xs text-emerald-400/20 italic">Seleziona almeno un campo</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onConfirm(selectedItems.map((i) => i.name))}
            disabled={selectedItems.length === 0}
            className="flex items-center gap-1.5 px-4 py-1.5 font-mono text-xs font-semibold text-emerald-900 bg-emerald-400 rounded hover:bg-emerald-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Genera Tabella
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-1.5 font-mono text-xs text-emerald-400/50 hover:text-emerald-400/80 transition-colors"
          >
            Annulla
          </button>
        </div>
      </div>
    </div>
  );
}
