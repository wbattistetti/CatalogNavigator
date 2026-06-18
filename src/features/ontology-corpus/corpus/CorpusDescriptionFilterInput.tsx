/**
 * Description filter input (apply on Enter; clear on X or empty input).
 */
import { Search, X } from 'lucide-react';
import type { CorpusDescriptionFilter } from '../useCorpusDescriptionFilter';

export function CorpusDescriptionFilterInput({
  filter,
}: {
  filter: CorpusDescriptionFilter;
}) {
  const showClear = filter.isActive || filter.input.trim().length > 0;

  return (
    <div className="relative flex items-center">
      <Search
        className="pointer-events-none absolute left-2 w-3.5 h-3.5 text-emerald-400/45"
        aria-hidden
      />
      <input
        type="search"
        value={filter.input}
        onChange={(e) => filter.setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') filter.apply();
        }}
        placeholder="Filtra descrizioni… tutte le parole (Invio)"
        aria-label="Filtra descrizioni"
        className="w-full rounded border border-[#1a3a2a] bg-[#060c08] py-1 pl-7 pr-7 font-mono text-[11px] text-emerald-100/90 placeholder:text-emerald-400/25 focus:border-emerald-400/40 focus:outline-none"
      />
      {showClear && (
        <button
          type="button"
          onClick={filter.clear}
          className="absolute right-1 flex h-5 w-5 items-center justify-center rounded text-emerald-400/50 hover:bg-emerald-400/10 hover:text-emerald-300"
          aria-label="Cancella filtro descrizioni"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
