/**
 * Corpus editor: paired description/segmentation rows plus hierarchical token tree.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Trash2, X } from 'lucide-react';
import type { TokenCategory } from '../../lib/dictionaryTree';
import { removeTokenFromLayout } from '../../lib/dictionaryTree';
import type { SelectionRange, TokenEntry } from '../../lib/tokenDictionary';
import {
  addToken,
  findHighlightSpans,
  getActiveTokens,
  getSelectionOffsetsInElement,
  segmentDescription,
  removeToken,
  selectionToTokenPhrase,
} from '../../lib/tokenDictionary';
import { TokenTreeEditor } from './TokenTreeEditor';

interface CorpusTokenEditorProps {
  descriptions: string[];
  tokens: TokenEntry[];
  categories: TokenCategory[];
  onTokensChange: (tokens: TokenEntry[]) => void;
  onCategoriesChange: (categories: TokenCategory[]) => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  phrase: string;
  range: SelectionRange | null;
}

/** Rounded chip for a matched token phrase; optional delete control. */
function TokenChip({
  label,
  muted = false,
  className = '',
  onRemove,
}: {
  label: string;
  muted?: boolean;
  className?: string;
  onRemove?: () => void;
}) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md border font-mono text-[11px] leading-tight whitespace-nowrap group/chip ${
        muted
          ? 'bg-[#0f1a12] border-[#1a3a2a] text-emerald-400/35'
          : 'bg-amber-400/20 border-amber-400/40 text-amber-100'
      } ${className}`}
    >
      <span>{label}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title="Rimuovi token"
          className="flex-shrink-0 p-0.5 rounded text-red-400/70 hover:text-red-300 hover:bg-red-400/15 transition-colors"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </span>
  );
}

function HighlightedDescription({
  text,
  activeTokens,
  onRemoveToken,
}: {
  text: string;
  activeTokens: string[];
  onRemoveToken: (token: string) => void;
}) {
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
        <TokenChip
          label={text.slice(span.start, span.end)}
          onRemove={() => onRemoveToken(span.token)}
        />
      </span>,
    );
    cursor = span.end;
  });
  if (cursor < text.length) {
    parts.push(<span key="tail">{text.slice(cursor)}</span>);
  }

  return <span className="text-emerald-300/80 leading-relaxed">{parts}</span>;
}

function SegmentationChips({
  text,
  activeTokens,
  categories,
  onRemoveToken,
}: {
  text: string;
  activeTokens: string[];
  categories: TokenCategory[];
  onRemoveToken: (token: string) => void;
}) {
  const { segments, path, unmatched } = useMemo(
    () => segmentDescription(text, activeTokens, categories),
    [text, activeTokens, categories],
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
            <TokenChip label={token} onRemove={() => onRemoveToken(token)} />
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

export function CorpusTokenEditor({
  descriptions,
  tokens,
  categories,
  onTokensChange,
  onCategoriesChange,
}: CorpusTokenEditorProps) {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const activeTokens = useMemo(() => getActiveTokens(tokens), [tokens]);
  const activeTokenSet = useMemo(() => new Set(activeTokens), [activeTokens]);

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

  const openMenuFromSelection = (
    clientX: number,
    clientY: number,
    sourceText: string,
    container: HTMLElement | null,
  ) => {
    const range = container ? getSelectionOffsetsInElement(container, sourceText) : null;
    const raw = window.getSelection()?.toString().trim() ?? '';
    const phrase = selectionToTokenPhrase(raw, range);
    if (!phrase) return;
    setMenu({ x: clientX, y: clientY, phrase: raw, range });
  };

  const handleMouseUp = (e: React.MouseEvent, sourceText: string) => {
    e.stopPropagation();
    const container = e.currentTarget as HTMLElement;
    requestAnimationFrame(() => openMenuFromSelection(e.clientX, e.clientY, sourceText, container));
  };

  const handleContextMenu = (e: React.MouseEvent, sourceText: string) => {
    e.preventDefault();
    const container = e.currentTarget as HTMLElement;
    openMenuFromSelection(e.clientX, e.clientY, sourceText, container);
  };

  const handleCreateToken = (rawPhrase: string, range: SelectionRange | null) => {
    try {
      onTokensChange(addToken(tokens, rawPhrase, range));
    } catch {
      /* invalid */
    }
    setMenu(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleRemoveToken = (text: string) => {
    onTokensChange(removeToken(tokens, text));
    onCategoriesChange(removeTokenFromLayout(categories, text));
  };

  const menuPhrase = menu ? selectionToTokenPhrase(menu.phrase, menu.range) : null;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 flex border border-[#1a3a2a] rounded overflow-hidden bg-[#080e0a]">
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
                  onMouseUp={(e) => handleMouseUp(e, text)}
                  onContextMenu={(e) => handleContextMenu(e, text)}
                >
                  <p className="font-mono text-xs select-text cursor-text">
                    <HighlightedDescription
                      text={text}
                      activeTokens={activeTokens}
                      onRemoveToken={handleRemoveToken}
                    />
                  </p>
                </div>
                <div className="flex-[1.2] min-w-0 px-3 py-2 border-l border-[#111] pt-2">
                  <SegmentationChips
                    text={text}
                    activeTokens={activeTokens}
                    categories={categories}
                    onRemoveToken={handleRemoveToken}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="w-56 flex-shrink-0 flex flex-col min-w-0 border-l border-[#1a3a2a]">
          <TokenTreeEditor
            tokens={tokens}
            categories={categories}
            onCategoriesChange={onCategoriesChange}
            onRemoveToken={handleRemoveToken}
          />
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
            onClick={() => handleCreateToken(menu.phrase, menu.range)}
            className="w-full text-left px-3 py-1.5 font-mono text-xs text-amber-200 hover:bg-amber-400/15 transition-colors"
          >
            Crea token
            <span className="block text-[9px] text-emerald-400/40 truncate max-w-[200px]">
              {menuPhrase ?? menu.phrase}
            </span>
          </button>
          {menuPhrase && activeTokenSet.has(menuPhrase) && (
            <button
              type="button"
              onClick={() => {
                handleRemoveToken(menuPhrase);
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
