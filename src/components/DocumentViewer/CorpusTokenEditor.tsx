/**
 * Corpus editor: paired description/segmentation rows (dictionary tree lives in Dizionari tab).
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { TokenCategory } from '../../lib/dictionaryTree';
import { removeTokenFromLayout } from '../../lib/dictionaryTree';
import type { HighlightSpan, SelectionRange, TokenEntry } from '../../lib/tokenDictionary';
import type { LoadedDictionaryRef } from '../../lib/multiDictionarySegment';
import { mergeLiveEditingIntoLoadedRefs, corpusHighlightTokens, segmentDescriptionMulti } from '../../lib/multiDictionarySegment';
import { DictionaryIcon } from './DictionaryIcon';
import {
  addToken,
  aliasCanonicalHint,
  findHighlightSpans,
  isCanonicalToken,
  getSelectionOffsetsInElement,
  segmentDescription,
  removeAlias,
  removeCanonicalToken,
  selectionToTokenPhrase,
  suggestLongerTokenInSource,
  tokenizeToWords,
} from '../../lib/tokenDictionary';
import { chipSurfaceStyleFromColor, resolveChipAppearance } from '../../lib/categoryIconCatalog';
import { useDocumentEditor } from '../../features/document-editor/DocumentEditorContext';
import {
  clearDictionaryTokenSelection,
  getDictionarySelectionSnapshot,
  selectSingleDictionaryToken,
  setDictionaryCategoryDropTarget,
  setDictionaryTokenDragActive,
  toggleDictionaryToken,
  useDictionaryChipDragging,
  useDictionaryChipSelected,
  useDictionarySelectionCount,
} from '../../features/document-editor/dictionarySelectionStore';
import {
  CorpusChipActionsProvider,
  useCorpusChipActions,
  type CorpusChipActions,
} from './CorpusChipActionsContext';
import {
  DRAG_THRESHOLD_PX,
  assignTokensToCategory,
  categoryIdAtPoint,
  formatDragGhostLabel,
} from '../../lib/dictionaryTokenDrag';

interface CorpusTokenEditorProps {
  descriptions: string[];
  tokens: TokenEntry[];
  categories: TokenCategory[];
  loadedRefs?: LoadedDictionaryRef[];
  editingDictionaryId?: string | null;
  onTokensChange: (tokens: TokenEntry[]) => void;
  onCategoriesChange: (categories: TokenCategory[]) => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  phrase: string;
  range: SelectionRange | null;
  sourceText: string;
}

interface LongerTokenPromptState {
  x: number;
  y: number;
  raw: string;
  range: SelectionRange | null;
  sourceText: string;
  shorterPhrase: string;
  longerToken: string;
}

/** Shared grid: row index | descriptions | segmentation (ratio 5:3). */
const CORPUS_ROW_GRID = 'grid grid-cols-[2rem_minmax(0,5fr)_minmax(0,3fr)]';

/** Chip that subscribes to selection store — only re-renders when its own selection changes. */
const SelectableCorpusChip = memo(function SelectableCorpusChip({
  canonical,
  categorizable,
  label,
  muted = false,
  variant = 'token',
  aliasOf,
  className = '',
  iconKey,
  iconColor,
  categoryColor,
  iconTitle,
  dictScope = 'project',
  onRemove,
}: {
  canonical: string;
  categorizable: boolean;
  label: string;
  muted?: boolean;
  variant?: 'token' | 'alias';
  aliasOf?: string;
  className?: string;
  iconKey?: string;
  iconColor?: string;
  categoryColor?: string;
  iconTitle?: string;
  dictScope?: 'project' | 'library';
  onRemove?: () => void;
}) {
  const selected = useDictionaryChipSelected(canonical);
  const dragging = useDictionaryChipDragging(canonical);
  const { onChipClick, onChipMouseDown } = useCorpusChipActions();
  const isAlias = variant === 'alias';
  const accent = categoryColor ?? iconColor;
  const tinted = accent && !muted && !isAlias
    ? chipSurfaceStyleFromColor(accent)
    : null;
  const selectionClass = categorizable && selected
    ? dragging
      ? 'border-2 border-emerald-300 opacity-90 cursor-grabbing shadow-[0_0_6px_rgba(52,211,153,0.45)]'
      : 'border-2 border-emerald-400 cursor-grab shadow-[0_0_6px_rgba(52,211,153,0.35)]'
    : categorizable
      ? 'cursor-pointer'
      : '';

  return (
    <span
      role={categorizable ? 'option' : undefined}
      aria-selected={categorizable ? selected : undefined}
      data-corpus-chip={categorizable ? 'true' : undefined}
      onClick={categorizable ? (e) => onChipClick(e, canonical) : undefined}
      onMouseDown={categorizable ? (e) => onChipMouseDown(e, canonical) : undefined}
      className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md border font-mono text-[11px] leading-tight whitespace-nowrap group/chip select-none ${
        muted
          ? 'bg-[#0f1a12] border-[#1a3a2a] text-emerald-300/75'
          : isAlias
            ? dictScope === 'project'
              ? 'bg-amber-400/15 border-amber-400/35 text-amber-100'
              : 'bg-sky-400/20 border-sky-400/40 text-sky-100'
            : tinted
              ? ''
              : dictScope === 'library'
                ? 'bg-sky-400/20 border-sky-400/40 text-sky-100'
                : 'bg-amber-400/20 border-amber-400/40 text-amber-100'
      } ${selectionClass} ${className}`}
      style={tinted ? {
        backgroundColor: tinted.backgroundColor,
        borderColor: tinted.borderColor,
        color: tinted.color,
      } : undefined}
      title={iconTitle ?? (isAlias && aliasOf ? `alias of: ${aliasOf}` : undefined)}
    >
      {iconKey && iconColor && (
        <DictionaryIcon iconKey={iconKey} iconColor={iconColor} size="xs" />
      )}
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
});

function CorpusSelectionBanner() {
  const count = useDictionarySelectionCount();
  if (count === 0) return null;
  return (
    <div className="px-3 py-1 border-b border-[#1a3a2a]/60 bg-[#0a1510] font-mono text-[9px] text-emerald-300/80">
      {count} chip sel. · Ctrl+click multiselezione · trascina su una categoria in Dizionari
    </div>
  );
}

function HighlightedDescription({
  text,
  tokens,
  loadedRefs,
  editingDictionaryId,
  editingCategories,
  onRemoveSpan,
  editableCanonicalSet,
}: {
  text: string;
  tokens: TokenEntry[];
  loadedRefs: LoadedDictionaryRef[];
  editingDictionaryId: string | null;
  editingCategories: TokenCategory[];
  onRemoveSpan: (span: HighlightSpan) => void;
  editableCanonicalSet: ReadonlySet<string>;
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
    const canonical = span.canonical;
    const categorizable = editableCanonicalSet.has(canonical);
    const appearance = resolveChipAppearance(
      canonical,
      loadedRefs,
      editingDictionaryId,
      editingCategories,
    );
    parts.push(
      <span key={`h-${i}`} className="inline-block mx-0.5 my-0.5 align-baseline">
        <SelectableCorpusChip
          canonical={canonical}
          categorizable={categorizable}
          label={text.slice(span.start, span.end)}
          variant={span.isAlias ? 'alias' : 'token'}
          aliasOf={span.isAlias ? span.canonical : undefined}
          iconKey={appearance.iconKey}
          iconColor={appearance.iconColor}
          categoryColor={appearance.categoryColor}
          iconTitle={appearance.title}
          dictScope={appearance.scope}
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

const MemoHighlightedDescription = memo(
  HighlightedDescription,
  (prev, next) =>
    prev.text === next.text
    && prev.tokens === next.tokens
    && prev.loadedRefs === next.loadedRefs
    && prev.editingDictionaryId === next.editingDictionaryId
    && prev.editingCategories === next.editingCategories
    && prev.onRemoveSpan === next.onRemoveSpan
    && prev.editableCanonicalSet === next.editableCanonicalSet,
);

function SegmentationChips({
  text,
  loadedRefs,
  editingDictionaryId,
  editingCategories,
  fallbackTokens,
  fallbackCategories,
  onRemoveCanonical,
  editableCanonicalSet,
}: {
  text: string;
  loadedRefs: LoadedDictionaryRef[];
  editingDictionaryId: string | null;
  editingCategories: TokenCategory[];
  fallbackTokens: TokenEntry[];
  fallbackCategories: TokenCategory[];
  onRemoveCanonical: (token: string) => void;
  editableCanonicalSet: ReadonlySet<string>;
}) {
  const { segments, unmatched } = useMemo(() => {
    if (loadedRefs.length > 0) {
      const result = segmentDescriptionMulti(text, loadedRefs);
      return { segments: result.segments, unmatched: result.unmatched };
    }
    const legacy = segmentDescription(text, fallbackTokens, fallbackCategories);
    return {
      segments: legacy.segments.map((t) => ({ text: t, dictionaryId: '' })),
      unmatched: legacy.unmatched,
    };
  }, [text, loadedRefs, fallbackTokens, fallbackCategories]);

  if (segments.length === 0) {
    return (
      <span className={`font-mono text-[10px] italic ${
        unmatched.length > 0 ? 'text-amber-300/85' : 'text-emerald-400/55'
      }`}>
        {unmatched.length > 0 ? 'nessun token' : '—'}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {segments.map((seg, i) => {
        const categorizable = editableCanonicalSet.has(seg.text);
        const appearance = resolveChipAppearance(
          seg.text,
          loadedRefs,
          editingDictionaryId,
          editingCategories.length > 0 ? editingCategories : fallbackCategories,
        );
        return (
          <span key={`${seg.text}-${i}`} className="inline-flex items-center">
            <SelectableCorpusChip
              canonical={seg.text}
              categorizable={categorizable}
              label={seg.text}
              iconKey={appearance.iconKey}
              iconColor={appearance.iconColor}
              categoryColor={appearance.categoryColor}
              iconTitle={appearance.title}
              dictScope={appearance.scope}
              onRemove={categorizable ? () => onRemoveCanonical(seg.text) : undefined}
            />
            {i < segments.length - 1 && (
              <span className="text-emerald-400/60 font-mono text-xs mx-0.5">·</span>
            )}
          </span>
        );
      })}
    </div>
  );
}

const MemoSegmentationChips = memo(
  SegmentationChips,
  (prev, next) =>
    prev.text === next.text
    && prev.loadedRefs === next.loadedRefs
    && prev.editingDictionaryId === next.editingDictionaryId
    && prev.editingCategories === next.editingCategories
    && prev.fallbackTokens === next.fallbackTokens
    && prev.fallbackCategories === next.fallbackCategories
    && prev.onRemoveCanonical === next.onRemoveCanonical
    && prev.editableCanonicalSet === next.editableCanonicalSet,
);

export function CorpusTokenEditor({
  descriptions,
  tokens,
  categories,
  loadedRefs = [],
  editingDictionaryId = null,
  onTokensChange,
  onCategoriesChange,
}: CorpusTokenEditorProps) {
  const {
    openDictionaryTree,
    startDictionaryAliasPick,
    cancelDictionaryAliasPick,
    dictionaryAliasPick,
  } = useDocumentEditor();
  const projectDictionaryId = editingDictionaryId;

  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const dragGhostRef = useRef<HTMLDivElement>(null);
  const [longerTokenPrompt, setLongerTokenPrompt] = useState<LongerTokenPromptState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const longerPromptRef = useRef<HTMLDivElement>(null);
  const pendingMenuFrameRef = useRef<number | null>(null);
  const lastMouseUpAtRef = useRef(0);

  const DOUBLE_CLICK_GAP_MS = 450;

  const cancelPendingMenuOpen = useCallback(() => {
    if (pendingMenuFrameRef.current !== null) {
      cancelAnimationFrame(pendingMenuFrameRef.current);
      pendingMenuFrameRef.current = null;
    }
  }, []);

  const aliasEntryByText = useMemo(() => {
    const map = new Map<string, TokenEntry>();
    for (const t of tokens) {
      if (t.aliasOf) map.set(t.text, t);
    }
    return map;
  }, [tokens]);

  /** Live loaded refs + unsaved edits — shared by description chips and segmentation. */
  const effectiveLoadedRefs = useMemo(
    () => mergeLiveEditingIntoLoadedRefs(loadedRefs, editingDictionaryId, tokens, categories),
    [loadedRefs, editingDictionaryId, tokens, categories],
  );

  const highlightTokens = useMemo(
    () => corpusHighlightTokens(loadedRefs, editingDictionaryId, tokens, categories),
    [loadedRefs, editingDictionaryId, tokens, categories],
  );

  const editableCanonicalSet = useMemo(
    () => new Set(tokens.filter(isCanonicalToken).map((t) => t.text)),
    [tokens],
  );

  const hideDragGhost = useCallback(() => {
    const ghost = dragGhostRef.current;
    if (!ghost) return;
    ghost.style.left = '-9999px';
    ghost.style.top = '0';
    ghost.style.visibility = 'hidden';
  }, []);

  const showDragGhost = useCallback((label: string, clientX: number, clientY: number) => {
    const ghost = dragGhostRef.current;
    if (!ghost) return;
    ghost.textContent = label;
    ghost.style.left = `${clientX + 12}px`;
    ghost.style.top = `${clientY + 16}px`;
    ghost.style.visibility = 'visible';
  }, []);

  const moveChipsToCategory = useCallback((targetKey: string, tokenTexts: string[]) => {
    const valid = tokenTexts.filter((t) => editableCanonicalSet.has(t));
    if (valid.length === 0) return;
    try {
      onCategoriesChange(assignTokensToCategory(categories, targetKey, valid));
    } catch {
      /* invalid */
    }
  }, [categories, editableCanonicalSet, onCategoriesChange]);

  const handleChipClick = useCallback((e: React.MouseEvent, canonical: string) => {
    if (!editableCanonicalSet.has(canonical)) return;
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      toggleDictionaryToken(canonical);
      return;
    }
    selectSingleDictionaryToken(canonical);
  }, [editableCanonicalSet]);

  const startChipPointerDrag = useCallback((e: React.MouseEvent, canonical: string) => {
    if (!editableCanonicalSet.has(canonical)) return;
    if ((e.target as HTMLElement).closest('button')) return;
    e.stopPropagation();
    const currentSelected = getDictionarySelectionSnapshot().selected;
    if (!currentSelected.has(canonical)) return;
    if (e.shiftKey || e.ctrlKey || e.metaKey) return;

    const texts = [...currentSelected].filter((t) => editableCanonicalSet.has(t));
    if (texts.length === 0) return;

    const originX = e.clientX;
    const originY = e.clientY;
    let active = false;

    const onMove = (ev: MouseEvent) => {
      if (!active) {
        if (Math.hypot(ev.clientX - originX, ev.clientY - originY) < DRAG_THRESHOLD_PX) return;
        active = true;
        setDictionaryTokenDragActive(true);
        showDragGhost(formatDragGhostLabel(texts), ev.clientX, ev.clientY);
      } else {
        showDragGhost(formatDragGhostLabel(texts), ev.clientX, ev.clientY);
        setDictionaryCategoryDropTarget(categoryIdAtPoint(ev.clientX, ev.clientY));
      }
    };

    const onUp = (ev: MouseEvent) => {
      if (active) {
        const catId = categoryIdAtPoint(ev.clientX, ev.clientY);
        if (catId) moveChipsToCategory(catId, texts);
      }
      setDictionaryTokenDragActive(false);
      setDictionaryCategoryDropTarget(null);
      hideDragGhost();
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [
    editableCanonicalSet,
    hideDragGhost,
    moveChipsToCategory,
    showDragGhost,
  ]);

  const chipActions = useMemo((): CorpusChipActions => ({
    editableCanonicalSet,
    onChipClick: handleChipClick,
    onChipMouseDown: startChipPointerDrag,
  }), [editableCanonicalSet, handleChipClick, startChipPointerDrag]);

  const rows = useMemo(
    () =>
      descriptions
        .map((text, rowIndex) => ({ rowIndex, text: text.trim() }))
        .filter((r) => r.text.length > 0)
        .sort((a, b) => a.text.localeCompare(b.text, 'it', { sensitivity: 'base' })),
    [descriptions],
  );

  const cancelAliasPick = cancelDictionaryAliasPick;

  useEffect(() => () => cancelPendingMenuOpen(), [cancelPendingMenuOpen]);

  useEffect(() => {
    if (!longerTokenPrompt) return;
    const closePrompt = (e: PointerEvent) => {
      if (longerPromptRef.current?.contains(e.target as Node)) return;
      setLongerTokenPrompt(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLongerTokenPrompt(null);
    };
    document.addEventListener('pointerdown', closePrompt);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', closePrompt);
      document.removeEventListener('keydown', onKey);
    };
  }, [longerTokenPrompt]);

  useLayoutEffect(() => {
    const el = longerPromptRef.current;
    if (!el || !longerTokenPrompt) return;
    const pad = 8;
    const rect = el.getBoundingClientRect();
    let left = longerTokenPrompt.x;
    let top = longerTokenPrompt.y;
    if (left + rect.width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (top + rect.height > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - rect.height - pad);
    }
    if (left < pad) left = pad;
    if (top < pad) top = pad;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [longerTokenPrompt]);

  useEffect(() => {
    if (!menu) return;
    const closeMenu = (e: PointerEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenu(null);
    };
    document.addEventListener('pointerdown', closeMenu);
    return () => document.removeEventListener('pointerdown', closeMenu);
  }, [menu]);

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el || !menu) return;
    const pad = 8;
    const rect = el.getBoundingClientRect();
    let left = menu.x;
    let top = menu.y;
    if (left + rect.width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (top + rect.height > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - rect.height - pad);
    }
    if (left < pad) left = pad;
    if (top < pad) top = pad;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [menu]);

  useEffect(() => {
    if (!dictionaryAliasPick) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelAliasPick();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dictionaryAliasPick, cancelAliasPick]);

  const commitNewToken = useCallback((raw: string, range: SelectionRange | null) => {
    try {
      const phrase = selectionToTokenPhrase(raw, range);
      onTokensChange(addToken(tokens, raw, range));
      if (phrase && projectDictionaryId) {
        openDictionaryTree({ dictionaryId: projectDictionaryId, focusToken: phrase });
      }
    } catch {
      /* invalid */
    }
    window.getSelection()?.removeAllRanges();
  }, [onTokensChange, openDictionaryTree, projectDictionaryId, tokens]);

  const openLongerTokenPrompt = useCallback((
    clientX: number,
    clientY: number,
    sourceText: string,
    raw: string,
    range: SelectionRange | null,
    shorterPhrase: string,
    longerToken: string,
  ) => {
    setMenu(null);
    setLongerTokenPrompt({
      x: clientX,
      y: clientY,
      raw,
      range,
      sourceText,
      shorterPhrase,
      longerToken,
    });
  }, []);

  const attemptTokenCreate = useCallback((
    clientX: number,
    clientY: number,
    sourceText: string,
    raw: string,
    range: SelectionRange | null,
  ): boolean => {
    const phrase = selectionToTokenPhrase(raw, range);
    if (!phrase) return false;
    if (tokens.some((t) => t.text === phrase && isCanonicalToken(t))) return false;

    const longer = suggestLongerTokenInSource(phrase, sourceText, range, tokens);
    if (longer) {
      openLongerTokenPrompt(clientX, clientY, sourceText, raw, range, phrase, longer);
      return true;
    }

    commitNewToken(raw, range);
    return true;
  }, [commitNewToken, openLongerTokenPrompt, tokens]);

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
    setLongerTokenPrompt(null);
    setMenu({ x: clientX, y: clientY, phrase: raw, range, sourceText });
  };

  const openSelectionUi = useCallback((
    clientX: number,
    clientY: number,
    sourceText: string,
    container: HTMLElement,
  ) => {
    openContextMenuFromSelection(clientX, clientY, sourceText, container);
  }, []);

  const handleDoubleClick = (e: React.MouseEvent, sourceText: string) => {
    e.stopPropagation();
    cancelPendingMenuOpen();
    setMenu(null);
    setLongerTokenPrompt(null);
    const container = e.currentTarget as HTMLElement;
    requestAnimationFrame(() => {
      const range = getSelectionOffsetsInElement(container, sourceText);
      const raw = window.getSelection()?.toString().trim() ?? '';
      const phrase = selectionToTokenPhrase(raw, range);
      if (!phrase || tokenizeToWords(phrase).length !== 1) return;
      attemptTokenCreate(e.clientX, e.clientY, sourceText, raw, range);
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (dictionaryAliasPick || e.button !== 0) return;
    if (Date.now() - lastMouseUpAtRef.current < DOUBLE_CLICK_GAP_MS) {
      cancelPendingMenuOpen();
      setMenu(null);
      setLongerTokenPrompt(null);
    }
  };

  const handleMouseUp = (e: React.MouseEvent, sourceText: string) => {
    if (dictionaryAliasPick || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, [data-corpus-chip]')) return;

    cancelPendingMenuOpen();
    if (e.detail >= 2) return;

    lastMouseUpAtRef.current = Date.now();
    const container = e.currentTarget as HTMLElement;
    const { clientX, clientY } = e;
    openSelectionUi(clientX, clientY, sourceText, container);
  };

  const handleContextMenu = (e: React.MouseEvent, sourceText: string) => {
    e.preventDefault();
    if (dictionaryAliasPick) return;
    const container = e.currentTarget as HTMLElement;
    openContextMenuFromSelection(e.clientX, e.clientY, sourceText, container);
  };

  const createTokenFromMenu = () => {
    if (!menu) return;
    const handled = attemptTokenCreate(menu.x, menu.y, menu.sourceText, menu.phrase, menu.range);
    if (handled) setMenu(null);
  };

  const startAliasPick = () => {
    if (!menu) return;
    const normalizedPhrase = selectionToTokenPhrase(menu.phrase, menu.range);
    if (!normalizedPhrase) return;
    startDictionaryAliasPick({
      phrase: menu.phrase,
      range: menu.range,
      normalizedPhrase,
    });
    setMenu(null);
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
  const menuWordCount = menuPhrase ? tokenizeToWords(menuPhrase).length : 0;
  const canCreateToken = Boolean(menuPhrase && !menuIsCanonical && menuWordCount >= 1);
  const canStartAliasPick = Boolean(menuPhrase && !menuIsCanonical);

  return (
    <CorpusChipActionsProvider value={chipActions}>
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 flex border border-[#1a3a2a] rounded overflow-hidden bg-[#080e0a]">
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          <div
            className="flex-1 min-h-0 overflow-y-auto"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('[role="option"]')) return;
              if (getDictionarySelectionSnapshot().selected.size > 0) {
                clearDictionaryTokenSelection();
              }
            }}
          >
            <div
              className={`sticky top-0 z-10 ${CORPUS_ROW_GRID} border-b border-[#1a3a2a] bg-[#0a1510]`}
            >
              <span className="flex-shrink-0 px-1 py-1.5 font-mono text-[9px] text-emerald-400/70 uppercase tracking-wider text-center">
                #
              </span>
              <div className="min-w-0 px-3 py-1.5 font-mono text-[10px] text-emerald-300/85 uppercase tracking-wider">
                Descrizioni
              </div>
              <div className="min-w-0 px-3 py-1.5 border-l border-[#1a3a2a] font-mono text-[10px] text-amber-300/85 uppercase tracking-wider">
                Segmentazione
              </div>
            </div>
            <CorpusSelectionBanner />
            {rows.map(({ rowIndex, text }) => (
              <div
                key={rowIndex}
                className={`${CORPUS_ROW_GRID} min-h-[2.75rem] items-start border-b border-[#111] hover:bg-[#0f1a12]`}
              >
                <span className="font-mono text-[9px] text-emerald-300/80 pt-2.5 text-center tabular-nums">
                  R{rowIndex}
                </span>
                <div
                  className="min-w-0 px-3 py-2"
                  onMouseDown={handleMouseDown}
                  onDoubleClick={(e) => handleDoubleClick(e, text)}
                  onMouseUp={(e) => handleMouseUp(e, text)}
                  onContextMenu={(e) => handleContextMenu(e, text)}
                >
                  <p className="font-mono text-xs select-text cursor-text">
                    <MemoHighlightedDescription
                      text={text}
                      tokens={highlightTokens}
                      loadedRefs={effectiveLoadedRefs}
                      editingDictionaryId={projectDictionaryId}
                      editingCategories={categories}
                      onRemoveSpan={handleRemoveSpan}
                      editableCanonicalSet={editableCanonicalSet}
                    />
                  </p>
                </div>
                <div className="min-w-0 px-3 py-2 border-l border-[#1a3a2a]">
                  <MemoSegmentationChips
                    text={text}
                    loadedRefs={effectiveLoadedRefs}
                    editingDictionaryId={projectDictionaryId}
                    editingCategories={categories}
                    fallbackTokens={tokens}
                    fallbackCategories={categories}
                    onRemoveCanonical={handleRemoveCanonical}
                    editableCanonicalSet={editableCanonicalSet}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {menu && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[10000] min-w-[180px] py-1 rounded border border-sky-400/30 bg-[#0a1510] shadow-2xl"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {canCreateToken && (
            <button
              type="button"
              onClick={createTokenFromMenu}
              className="w-full text-left px-3 py-1.5 font-mono text-xs text-amber-200 hover:bg-amber-400/15 transition-colors"
            >
              Crea token
              <span className="block text-[9px] text-emerald-400/40 truncate max-w-[200px]">
                {menuPhrase}
              </span>
            </button>
          )}
          {canStartAliasPick && (
            <button
              type="button"
              onClick={startAliasPick}
              className={`w-full text-left px-3 py-1.5 font-mono text-xs text-sky-200 hover:bg-sky-400/15 transition-colors ${
                canCreateToken ? 'border-t border-[#1a3a2a]' : ''
              }`}
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
        </div>,
        document.body,
      )}

      {longerTokenPrompt && createPortal(
        <div
          ref={longerPromptRef}
          className="fixed z-[10001] w-[min(100vw-16px,280px)] rounded border border-amber-400/35 bg-[#0a1510] shadow-2xl p-3"
          style={{ left: longerTokenPrompt.x, top: longerTokenPrompt.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <p className="font-mono text-[11px] text-emerald-200/90 leading-snug">
            Intendi forse
          </p>
          <p className="mt-1 font-mono text-xs text-amber-100 break-words">
            {longerTokenPrompt.longerToken}
          </p>
          <p className="mt-2 font-mono text-[9px] text-emerald-400/55 leading-relaxed">
            Sì → seleziona la frase più lunga · No → crea «{longerTokenPrompt.shorterPhrase}»
          </p>
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setLongerTokenPrompt(null);
                window.getSelection()?.removeAllRanges();
              }}
              className="px-3 py-1 rounded font-mono text-[11px] text-emerald-200/90 border border-[#1a3a2a] hover:bg-emerald-400/10 transition-colors"
            >
              Sì
            </button>
            <button
              type="button"
              onClick={() => {
                commitNewToken(longerTokenPrompt.raw, longerTokenPrompt.range);
                setLongerTokenPrompt(null);
              }}
              className="px-3 py-1 rounded font-mono text-[11px] text-amber-100 border border-amber-400/40 bg-amber-400/15 hover:bg-amber-400/25 transition-colors"
            >
              No
            </button>
          </div>
        </div>,
        document.body,
      )}

      {typeof document !== 'undefined' && createPortal(
        <div
          ref={dragGhostRef}
          aria-hidden
          className="fixed z-[10000] pointer-events-none px-3 py-2 rounded-md border border-sky-400/50 bg-[#0a1510] shadow-xl font-mono text-[11px] text-sky-100 max-w-[220px] truncate whitespace-nowrap"
          style={{ left: -9999, top: 0, visibility: 'hidden' }}
        />,
        document.body,
      )}
    </div>
    </CorpusChipActionsProvider>
  );
}
