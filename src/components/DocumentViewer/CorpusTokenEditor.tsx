/**
 * Corpus editor: paired description/segmentation rows plus token registry.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import type { TokenEntry } from '../../lib/tokenDictionary';
import {
  addToken,
  findHighlightSpans,
  getActiveTokens,
  segmentDescription,
  listAllTokensSorted,
  removeToken,
  selectionToTokenPhrase,
} from '../../lib/tokenDictionary';

interface CorpusTokenEditorProps {
  descriptions: string[];
  tokens: TokenEntry[];
  onChange: (tokens: TokenEntry[]) => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  phrase: string;
}

/** Rounded chip for a matched token phrase. */
function TokenChip({
  label,
  muted = false,
  className = '',
}: {
  label: string;
  muted?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md border font-mono text-[11px] leading-tight whitespace-nowrap ${
        muted
          ? 'bg-[#0f1a12] border-[#1a3a2a] text-emerald-400/35'
          : 'bg-amber-400/20 border-amber-400/40 text-amber-100'
      } ${className}`}
    >
      {label}
    </span>
  );
}

function HighlightedDescription({ text, activeTokens }: { text: string; activeTokens: string[] }) {
  const spans = useMemo(() => findHighlightSpans(text, activeTokens), [text, activeTokens]);

  if (spans.length === 0) {
    return <span className="text-emerald-300/80">{text}</span>;
  }

  const parts: ReactNode[] = [];
  let cursor = 0;
  spans.forEach((span, i) => {
    if (span.start > cursor) {
      parts.push(<span key={`t-${i}`}>{text.slice(cursor, span.start)}</span>);
    }
    parts.push(
      <span key={`h-${i}`} className="inline-block mx-0.5 my-0.5 align-baseline">
        <TokenChip label={text.slice(span.start, span.end)} />
      </span>,
    );
    cursor = span.end;
  });
  if (cursor < text.length) {
    parts.push(<span key="tail">{text.slice(cursor)}</span>);
  }

  return <span className="text-emerald-300/80 leading-relaxed">{parts}</span>;
}

function SegmentationChips({ text, activeTokens }: { text: string; activeTokens: string[] }) {
  const { segments, path, unmatched } = useMemo(
    () => segmentDescription(text, activeTokens),
    [text, activeTokens],
  );

  if (segments.length === 0) {
    return (
      <span className="font-mono text-[10px] text-emerald-400/20 italic">
        {unmatched.length > 0 ? 'nessun token' : '—'}
      </span>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1">
        {segments.map((token, i) => (
          <span key={i} className="inline-flex items-center">
            <TokenChip label={token} />
            {i < segments.length - 1 && (
              <span className="text-emerald-400/25 font-mono text-xs mx-0.5">·</span>
            )}
          </span>
        ))}
      </div>
      <p className="font-mono text-[9px] text-emerald-400/35 break-all leading-snug" title="Path foglia">
        → {path}
      </p>
    </div>
  );
}

function TokenRegistryItem({
  entry,
  onRemove,
}: {
  entry: TokenEntry;
  onRemove: (text: string) => void;
}) {
  return (
    <div className="group flex items-center gap-1 px-1 py-1 rounded hover:bg-[#0f1a12] transition-colors">
      <div className="flex-1 min-w-0 overflow-hidden">
        <TokenChip label={entry.text} muted={!entry.enabled} />
        {entry.suppressedBy && (
          <span className="block font-mono text-[8px] text-emerald-400/30 pl-0.5 truncate" title={`Soppresso da: ${entry.suppressedBy}`}>
            ↳ {entry.suppressedBy}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => onRemove(entry.text)}
        className="flex-shrink-0 p-0.5 rounded text-red-400/0 group-hover:text-red-400/80 hover:bg-red-400/10 transition-all opacity-0 group-hover:opacity-100"
        title="Rimuovi token"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function CorpusTokenEditor({ descriptions, tokens, onChange }: CorpusTokenEditorProps) {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const activeTokens = useMemo(() => getActiveTokens(tokens), [tokens]);
  const activeTokenSet = useMemo(() => new Set(activeTokens), [activeTokens]);
  const allTokensSorted = useMemo(() => listAllTokensSorted(tokens), [tokens]);

  const rows = useMemo(
    () =>
      descriptions
        .map((text, rowIndex) => ({ rowIndex, text: text.trim() }))
        .filter((r) => r.text.length > 0)
        .sort((a, b) => a.text.localeCompare(b.text, 'it', { sensitivity: 'base' })),
    [descriptions],
  );

  useEffect(() => {
    if (!menu) return;
    const closeMenu = (e: PointerEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenu(null);
    };
    const closeOnScroll = () => setMenu(null);
    document.addEventListener('pointerdown', closeMenu);
    window.addEventListener('scroll', closeOnScroll, true);
    return () => {
      document.removeEventListener('pointerdown', closeMenu);
      window.removeEventListener('scroll', closeOnScroll, true);
    };
  }, [menu]);

  const openMenuFromSelection = (clientX: number, clientY: number) => {
    const sel = window.getSelection();
    const raw = sel?.toString().trim() ?? '';
    if (!raw) return;
    const phrase = selectionToTokenPhrase(raw);
    if (!phrase) return;
    setMenu({ x: clientX, y: clientY, phrase: raw });
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    e.stopPropagation();
    requestAnimationFrame(() => openMenuFromSelection(e.clientX, e.clientY));
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    openMenuFromSelection(e.clientX, e.clientY);
  };

  const handleCreateToken = (rawPhrase: string) => {
    try {
      onChange(addToken(tokens, rawPhrase));
    } catch {
      /* invalid */
    }
    setMenu(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleRemoveToken = (text: string) => {
    onChange(removeToken(tokens, text));
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 flex border border-[#1a3a2a] rounded overflow-hidden bg-[#080e0a]">
        {/* Paired rows: description | segmentation (single scroll) */}
        <div className="flex-[1] min-w-0 flex flex-col border-r border-[#1a3a2a]">
          <div className="flex-shrink-0 flex border-b border-[#1a3a2a] bg-[#0a1510]">
            <span className="flex-shrink-0 w-8" />
            <div className="flex-[2] min-w-0 px-3 py-1.5 font-mono text-[10px] text-emerald-400/50 uppercase tracking-wider">
              Descrizioni
            </div>
            <div className="flex-[1.2] min-w-0 px-3 py-1.5 border-l border-[#1a3a2a] font-mono text-[10px] text-amber-400/50 uppercase tracking-wider">
              Segmentazione
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {rows.map(({ rowIndex, text }) => (
              <div
                key={rowIndex}
                className="flex min-h-[2.75rem] items-start border-b border-[#111] hover:bg-[#0f1a12] transition-colors"
              >
                <span className="flex-shrink-0 font-mono text-[9px] text-emerald-400/30 pt-2.5 w-8 text-center">
                  R{rowIndex}
                </span>
                <div
                  className="flex-[2] min-w-0 px-3 py-2"
                  onMouseUp={handleMouseUp}
                  onContextMenu={handleContextMenu}
                >
                  <p className="font-mono text-xs select-text cursor-text">
                    <HighlightedDescription text={text} activeTokens={activeTokens} />
                  </p>
                </div>
                <div className="flex-[1.2] min-w-0 px-3 py-2 border-l border-[#111] pt-2">
                  <SegmentationChips text={text} activeTokens={activeTokens} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Token registry (independent scroll) */}
        <div className="w-44 flex-shrink-0 flex flex-col min-w-0">
          <div className="flex-shrink-0 px-3 py-1.5 border-b border-[#1a3a2a] bg-[#0a1510] font-mono text-[10px] text-sky-400/50 uppercase tracking-wider">
            Token ({allTokensSorted.length})
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-1">
            {allTokensSorted.length === 0 ? (
              <p className="font-mono text-[10px] text-emerald-400/25 px-2 py-4 text-center leading-relaxed">
                Nessun token. Seleziona testo a sinistra.
              </p>
            ) : (
              allTokensSorted.map((entry) => (
                <TokenRegistryItem key={entry.text} entry={entry} onRemove={handleRemoveToken} />
              ))
            )}
          </div>
        </div>
      </div>

      {menu && (
        <div
          ref={menuRef}
          className="fixed z-[100] min-w-[160px] py-1 rounded border border-amber-400/30 bg-[#0a1510] shadow-2xl"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => handleCreateToken(menu.phrase)}
            className="w-full text-left px-3 py-1.5 font-mono text-xs text-amber-200 hover:bg-amber-400/15 transition-colors"
          >
            Crea token
            <span className="block text-[9px] text-emerald-400/40 truncate max-w-[200px]">
              {selectionToTokenPhrase(menu.phrase) ?? menu.phrase}
            </span>
          </button>
          {selectionToTokenPhrase(menu.phrase) && activeTokenSet.has(selectionToTokenPhrase(menu.phrase)!) && (
            <button
              type="button"
              onClick={() => {
                handleRemoveToken(selectionToTokenPhrase(menu.phrase)!);
                setMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 font-mono text-xs text-red-300/80 hover:bg-red-400/10 transition-colors border-t border-[#1a3a2a]"
            >
              Rimuovi token
            </button>
          )}
        </div>
      )}
    </div>
  );
}
