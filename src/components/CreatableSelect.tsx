/**
 * Select with optional creatable values (Omnia-style combo).
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface CreatableSelectProps {
  label?: string;
  value: string;
  options: string[];
  placeholder?: string;
  onChange: (value: string) => void;
  creatable?: boolean;
}

export function CreatableSelect({
  label,
  value,
  options,
  placeholder = 'Seleziona…',
  onChange,
  creatable = true,
}: CreatableSelectProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = [...new Set(options)];
    if (!q) return base;
    return base.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  const commit = useCallback((next: string) => {
    onChange(next);
    setQuery(next);
    setOpen(false);
  }, [onChange]);

  const canCreate = creatable && query.trim() && !options.some(
    (o) => o.toLowerCase() === query.trim().toLowerCase(),
  );

  return (
    <div ref={rootRef} className="relative">
      {label && (
        <label className="block font-mono text-xs text-[#c9a84c]/80 mb-1.5">{label}</label>
      )}
      <div className="relative">
        <input
          type="text"
          value={query}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canCreate) {
              e.preventDefault();
              commit(query.trim());
            }
            if (e.key === 'Escape') setOpen(false);
          }}
          className="w-full px-3 py-2 pr-8 rounded bg-[#0a1510] border border-[#c9a84c]/30 text-[#e8d48b] font-mono text-sm placeholder:text-[#c9a84c]/25 focus:outline-none focus:border-[#c9a84c]/60"
          list={listId}
        />
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[#c9a84c]/40 pointer-events-none" />
      </div>
      {open && (filtered.length > 0 || canCreate) && (
        <ul className="absolute z-50 mt-1 w-full max-h-40 overflow-y-auto rounded border border-[#c9a84c]/30 bg-[#0a1510] shadow-lg">
          {filtered.map((opt) => (
            <li key={opt}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(opt)}
                className="w-full text-left px-3 py-2 font-mono text-sm text-[#e8d48b]/90 hover:bg-[#c9a84c]/10"
              >
                {opt}
              </button>
            </li>
          ))}
          {canCreate && (
            <li>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(query.trim())}
                className="w-full text-left px-3 py-2 font-mono text-sm text-violet-300 hover:bg-violet-400/10"
              >
                Crea &quot;{query.trim()}&quot;
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
