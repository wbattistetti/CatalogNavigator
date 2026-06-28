/**
 * Toolbar to inject category+token pairs into VB chat session before the first turn.
 */
import { memo, useCallback, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { TokenCategory } from '../../lib/dictionaryTree';
import {
  injectableCategories,
  type InjectedConceptPair,
  upsertInjectedPair,
} from '../../lib/injectedConcepts';

const LABEL = 'font-mono text-xs';

export interface InjectedConceptsToolbarProps {
  categories: TokenCategory[];
  pairs: InjectedConceptPair[];
  onPairsChange: (pairs: InjectedConceptPair[]) => void;
  disabled?: boolean;
}

export const InjectedConceptsToolbar = memo(function InjectedConceptsToolbar({
  categories,
  pairs,
  onPairsChange,
  disabled = false,
}: InjectedConceptsToolbarProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedToken, setSelectedToken] = useState('');

  const injectable = useMemo(() => injectableCategories(categories), [categories]);

  const tokensForCategory = useMemo(() => {
    const cat = injectable.find((c) => c.name === selectedCategory);
    return cat?.tokenTexts ?? [];
  }, [injectable, selectedCategory]);

  const handleCategoryChange = useCallback((name: string) => {
    setSelectedCategory(name);
    const cat = injectable.find((c) => c.name === name);
    setSelectedToken(cat?.tokenTexts[0] ?? '');
  }, [injectable]);

  const handleAdd = useCallback(() => {
    if (!selectedCategory || !selectedToken) return;
    onPairsChange(upsertInjectedPair(pairs, {
      categoryName: selectedCategory,
      token: selectedToken,
    }));
    setPickerOpen(false);
    setSelectedCategory('');
    setSelectedToken('');
  }, [onPairsChange, pairs, selectedCategory, selectedToken]);

  const handleRemove = useCallback((categoryName: string) => {
    onPairsChange(pairs.filter((p) => p.categoryName !== categoryName));
  }, [onPairsChange, pairs]);

  if (injectable.length === 0) return null;

  return (
    <div className="flex-shrink-0 border-b border-[#1a3a2a] bg-[#060c08] px-3 py-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className={`${LABEL} text-emerald-400/60 uppercase tracking-wide`}>
          Concetti iniettati
        </span>
        {!disabled && (
          <button
            type="button"
            onClick={() => {
              setPickerOpen((v) => !v);
              if (!pickerOpen && injectable.length > 0) {
                handleCategoryChange(injectable[0]!.name);
              }
            }}
            className={`inline-flex items-center gap-1 ${LABEL} text-amber-300/90 hover:text-amber-200 px-1.5 py-0.5 rounded border border-amber-400/30 hover:bg-amber-400/10 transition-colors`}
          >
            <Plus className="w-3 h-3" />
            Concetto
          </button>
        )}
      </div>

      {pairs.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {pairs.map((pair) => (
            <li
              key={pair.categoryName}
              className={`inline-flex items-center gap-1 ${LABEL} px-2 py-0.5 rounded border border-emerald-400/25 bg-emerald-400/8 text-emerald-200/90`}
            >
              <span>{pair.categoryName}</span>
              <span className="text-emerald-400/50">=</span>
              <span className="text-emerald-100">{pair.token}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleRemove(pair.categoryName)}
                  className="ml-0.5 text-emerald-400/50 hover:text-red-300/90"
                  title="Rimuovi"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {pickerOpen && !disabled && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedCategory}
            onChange={(e) => handleCategoryChange(e.target.value)}
            className={`${LABEL} bg-[#0a1510] border border-[#1a3a2a] rounded px-2 py-1 text-emerald-200/90 focus:outline-none focus:border-emerald-400/40 max-w-[10rem]`}
          >
            {injectable.map((c) => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
          <select
            value={selectedToken}
            onChange={(e) => setSelectedToken(e.target.value)}
            disabled={tokensForCategory.length === 0}
            className={`${LABEL} bg-[#0a1510] border border-[#1a3a2a] rounded px-2 py-1 text-emerald-200/90 focus:outline-none focus:border-emerald-400/40 max-w-[12rem] disabled:opacity-40`}
          >
            {tokensForCategory.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!selectedCategory || !selectedToken}
            className={`${LABEL} px-2 py-1 rounded border border-emerald-400/40 text-emerald-200 hover:bg-emerald-400/10 disabled:opacity-30`}
          >
            Aggiungi
          </button>
          <button
            type="button"
            onClick={() => setPickerOpen(false)}
            className={`${LABEL} px-2 py-1 rounded text-emerald-400/50 hover:text-emerald-300/80`}
          >
            Annulla
          </button>
        </div>
      )}

      {pairs.length === 0 && !pickerOpen && (
        <p className={`${LABEL} text-emerald-400/40`}>
          Nessun concetto — il dialogo parte senza filtri preimpostati.
        </p>
      )}
    </div>
  );
});
