/**
 * Corpus editor: paired description/segmentation rows plus hierarchical token tree.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Key, X } from 'lucide-react';
import type { TokenCategory } from '../../lib/dictionaryTree';
import { removeTokenFromLayout } from '../../lib/dictionaryTree';
import type { HighlightSpan, SelectionRange, TokenEntry } from '../../lib/tokenDictionary';
import {
  addAlias,
  addToken,
  aliasCanonicalHint,
  findHighlightSpans,
  isCanonicalToken,
  getSelectionOffsetsInElement,
  segmentDescription,
  removeAlias,
  removeCanonicalToken,
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

interface AliasPickState {
  phrase: string;
  range: SelectionRange | null;
  normalizedPhrase: string;
}

/** Rounded chip for a matched token phrase; optional delete control on hover. */
function TokenChip({
  label,
  muted = false,
  variant = 'token',
  aliasOf,
  className = '',
  onRemove,
}: {
  label: string;
  muted?: boolean;
  variant?: 'token' | 'alias';
  aliasOf?: string;
  className?: string;
  onRemove?: () => void;
}) {
  const isAlias = variant === 'alias';

  return (
    <span
      className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md border font-mono text-[11px] leading-tight whitespace-nowrap group/chip ${
        muted
          ? 'bg-[#0f1a12] border-[#1a3a2a] text-emerald-400/35'
          : isAlias
            ? 'bg-sky-400/20 border-sky-400/40 text-sky-100'
            : 'bg-amber-400/20 border-amber-400/40 text-amber-100'
      } ${className}`}
      title={isAlias && aliasOf ? `alias of: ${aliasOf}` : undefined}
    >
      <span>
        {label}
        {isAlias && aliasOf && (
          <span className="text-sky-300/50"> ({aliasCanonicalHint(aliasOf)})</span>
        )}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title={isAlias ? 'Rimuovi alias' : 'Rimuovi token'}
          className="flex-shrink-0 p-0.5 rounded opacity-0 group-hover/chip:opacity-100 text-red-400/70 hover:text-red-300 hover:bg-red-400/15 transition-all"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </span>
  );
}

function HighlightedDescription({
  text,
  tokens,
  onRemoveSpan,
}: {
  text: string;
  tokens: TokenEntry[];
  onRemoveSpan: (span: HighlightSpan) => void;
}) {
  const spans = useMemo(() => findHighlightSpans(text, tokens), [text, tokens]);

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
          variant={span.isAlias ? 'alias' : 'token'}
          aliasOf={span.isAlias ? span.canonical : undefined}
          onRemove={() => onRemoveSpan(span)}
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
  tokens,
  categories,
  onRemoveCanonical,
}: {
  text: string;
  tokens: TokenEntry[];
  categories: TokenCategory[];
  onRemoveCanonical: (token: string) => void;
}) {
  const { segments, path, unmatched } = useMemo(
    () => segmentDescription(text, tokens, categories),
    [text, tokens, categories],
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
            <TokenChip label={token} onRemove={() => onRemoveCanonical(token)} />
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
  const [aliasPick, setAliasPick] = useState<AliasPickState | null>(null);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  const aliasEntryByText = useMemo(() => {
    const map = new Map<string, TokenEntry>();
    for (const t of tokens) {
      if (t.aliasOf) map.set(t.text, t);
    }
    return map;
  }, [tokens]);

  const rows = useMemo(
    () =>
      descriptions
        .map((text, rowIndex) => ({ rowIndex, text: text.trim() }))
        .filter((r) => r.text.length > 0)
        .sort((a, b) => a.text.localeCompare(b.text, 'it', { sensitivity: 'base' })),
    [descriptions],
  );

  const cancelAliasPick = useCallback(() => setAliasPick(null), []);

  useEffect(() => {
    if (!menu) return;
    const closeMenu = (e: PointerEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenu(null);
    };
    document.addEventListener('pointerdown', closeMenu);
    return () => document.removeEventListener('pointerdown', closeMenu);
  }, [menu]);

  useEffect(() => {
    if (!aliasPick) return;
    const onMove = (e: MouseEvent) => setCursorPos({ x: e.clientX, y: e.clientY });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelAliasPick();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('keydown', onKey);
    };
  }, [aliasPick, cancelAliasPick]);

  const openContextMenuFromSelection = (
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

  const handleDoubleClick = (e: React.MouseEvent, sourceText: string) => {
    e.stopPropagation();
    const container = e.currentTarget as HTMLElement;
    requestAnimationFrame(() => {
      const range = getSelectionOffsetsInElement(container, sourceText);
      const raw = window.getSelection()?.toString().trim() ?? '';
      try {
        onTokensChange(addToken(tokens, raw, range));
      } catch {
        /* invalid */
      }
      window.getSelection()?.removeAllRanges();
    });
  };

  const handleContextMenu = (e: React.MouseEvent, sourceText: string) => {
    e.preventDefault();
    if (aliasPick) return;
    const container = e.currentTarget as HTMLElement;
    openContextMenuFromSelection(e.clientX, e.clientY, sourceText, container);
  };

  const startAliasPick = () => {
    if (!menu) return;
    const normalizedPhrase = selectionToTokenPhrase(menu.phrase, menu.range);
    if (!normalizedPhrase) return;
    setAliasPick({
      phrase: menu.phrase,
      range: menu.range,
      normalizedPhrase,
    });
    setCursorPos({ x: menu.x, y: menu.y });
    setMenu(null);
  };

  const handleAliasTargetPick = (canonicalText: string) => {
    if (!aliasPick) return;
    try {
      onTokensChange(addAlias(tokens, aliasPick.phrase, canonicalText, aliasPick.range));
    } catch {
      /* invalid */
    }
    setAliasPick(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleRemoveCanonical = (text: string) => {
    onTokensChange(removeCanonicalToken(tokens, text));
    onCategoriesChange(removeTokenFromLayout(categories, text));
  };

  const handleRemoveAlias = (text: string) => {
    onTokensChange(removeAlias(tokens, text));
  };

  const handleRemoveSpan = (span: HighlightSpan) => {
    if (span.isAlias) {
      handleRemoveAlias(span.entryText);
    } else {
      handleRemoveCanonical(span.entryText);
    }
  };

  const menuPhrase = menu ? selectionToTokenPhrase(menu.phrase, menu.range) : null;
  const menuIsCanonical = menuPhrase
    ? tokens.some((t) => t.text === menuPhrase && isCanonicalToken(t))
    : false;
  const menuAliasEntry = menuPhrase ? aliasEntryByText.get(menuPhrase) : undefined;
  const canStartAliasPick = Boolean(menuPhrase && !menuIsCanonical);

  return (
    <div className={`flex flex-col h-full min-h-0 ${aliasPick ? 'cursor-crosshair' : ''}`}>
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
                  onDoubleClick={(e) => handleDoubleClick(e, text)}
                  onContextMenu={(e) => handleContextMenu(e, text)}
                >
                  <p className="font-mono text-xs select-text cursor-text">
                    <HighlightedDescription
                      text={text}
                      tokens={tokens}
                      onRemoveSpan={handleRemoveSpan}
                    />
                  </p>
                </div>
                <div className="flex-[1.2] min-w-0 px-3 py-2 border-l border-[#111] pt-2">
                  <SegmentationChips
                    text={text}
                    tokens={tokens}
                    categories={categories}
                    onRemoveCanonical={handleRemoveCanonical}
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
            onRemoveCanonical={handleRemoveCanonical}
            onRemoveAlias={handleRemoveAlias}
            aliasPickActive={aliasPick !== null}
            aliasPickPhrase={aliasPick?.normalizedPhrase ?? null}
            onAliasTargetPick={handleAliasTargetPick}
            onCancelAliasPick={cancelAliasPick}
          />
        </div>
      </div>

      {menu && (
        <div
          ref={menuRef}
          className="fixed z-[100] min-w-[180px] py-1 rounded border border-sky-400/30 bg-[#0a1510] shadow-2xl"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {canStartAliasPick && (
            <button
              type="button"
              onClick={startAliasPick}
              className="w-full text-left px-3 py-1.5 font-mono text-xs text-sky-200 hover:bg-sky-400/15 transition-colors"
            >
              Alias of…
              <span className="block text-[9px] text-emerald-400/40 truncate max-w-[200px]">
                {menuPhrase}
              </span>
            </button>
          )}
          {menuIsCanonical && (
            <button
              type="button"
              onClick={() => {
                handleRemoveCanonical(menuPhrase!);
                setMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 font-mono text-xs text-red-300/80 hover:bg-red-400/10 transition-colors border-t border-[#1a3a2a]"
            >
              Rimuovi token
            </button>
          )}
          {menuAliasEntry && (
            <button
              type="button"
              onClick={() => {
                handleRemoveAlias(menuPhrase!);
                setMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 font-mono text-xs text-red-300/80 hover:bg-red-400/10 transition-colors border-t border-[#1a3a2a]"
            >
              Rimuovi alias
              <span className="block text-[9px] text-emerald-400/40 truncate max-w-[200px]">
                alias of: {menuAliasEntry.aliasOf}
              </span>
            </button>
          )}
        </div>
      )}

      {aliasPick && (
        <div
          className="fixed z-[300] pointer-events-none"
          style={{ left: cursorPos.x + 14, top: cursorPos.y + 14 }}
        >
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border font-mono text-[11px] bg-sky-400/25 border-sky-400/50 text-sky-100 shadow-lg">
            <Key className="w-3 h-3 text-amber-400" />
            alias of…
          </span>
        </div>
      )}
    </div>
  );
}
