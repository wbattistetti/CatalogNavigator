/**
 * Two-panel dictionary editor: categories (left) and tokens (right).
 * Explorer-style token selection and pointer drag to categories; category reorder DnD.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Circle, Trash2, FolderPlus, Braces, Plus, GripVertical, Library, Scissors,
} from 'lucide-react';
import { DictionaryIcon } from './DictionaryIcon';
import { iconForCategory, NO_CATEGORY_ICON } from '../../lib/categoryIconCatalog';
import type { TokenCategory } from '../../lib/dictionaryTree';
import {
  NO_CATEGORY_SENTINEL,
  addTokenToCategorySorted,
  createCategoryWithTokens,
  deleteCategoryIfEmpty,
  findCategoryByName,
  moveTokensToRoot,
  normalizeCategoryOrders,
  reorderCategoryToIndex,
  rootTokenTexts,
  tokenTextsForCategoryView,
} from '../../lib/dictionaryTree';
import {
  addToken,
  aliasCanonicalHint,
  getSelectionOffsetsInElement,
  isCanonicalToken,
  selectionToTokenPhrase,
  tokenizeToWords,
  type TokenEntry,
} from '../../lib/tokenDictionary';
import { applyCanonicalTokenSplit, splitPartsFromTokenSelection } from '../../lib/splitCanonicalToken';
import { useListSelection } from '../../hooks/useListSelection';
import { useCorpusVirtualScroll } from '../../hooks/useCorpusVirtualScroll';
import {
  TOKEN_DRAG_MIME,
  TOKEN_DRAG_PLAIN_PREFIX,
  CATEGORY_DRAG_MIME,
  DRAG_THRESHOLD_PX,
  assignTokensToCategory,
  categoryIdAtPoint,
  formatDragGhostLabel,
  isTokenDragEvent,
  parseTokenDragPayload,
  tokenDragPayload,
} from '../../lib/dictionaryTokenDrag';
import {
  useDictionaryDragActive,
  useDictionaryDropTarget,
  useDictionarySelectedSet,
  useDictionarySelectionActions,
} from '../../features/document-editor/dictionarySelectionStore';

export interface TokenTreeEditorProps {
  tokens: TokenEntry[];
  categories: TokenCategory[];
  onTokensChange: (tokens: TokenEntry[]) => void;
  onCategoriesChange: (categories: TokenCategory[]) => void;
  onRemoveCanonical: (text: string) => void;
  onRemoveAlias: (text: string) => void;
  aliasPickActive?: boolean;
  aliasPickPhrase?: string | null;
  onAliasTargetPick?: (canonicalText: string) => void;
  onCancelAliasPick?: () => void;
  grammarPanelOpen?: boolean;
  onToggleGrammarPanel?: () => void;
  grammarEditToken?: string | null;
  onGrammarEditTokenChange?: (text: string | null) => void;
  /** When false, hides the generic "Dizionario (N) · categorie" title bar. */
  showDictionaryHeader?: boolean;
  /** After corpus token creation, select and scroll this token in the tree. */
  focusTokenText?: string | null;
  onFocusTokenHandled?: () => void;
  /** When set, project categories show a control to move the whole category to library. */
  onMoveCategoryToLibrary?: (categoryId: string, categoryName: string, tokenCount: number) => void;
}

const TOKEN_ROW_HEIGHT_PX = 30;
/** Single readable size for category names, counts, and token labels. */
const TREE_LABEL = 'font-mono text-xs';

function TokenRow({
  entry,
  selected,
  dragging,
  aliasPickActive,
  grammarEditActive,
  splittingActive,
  splitError,
  labelRef,
  onRemove,
  onStartSplit,
  onCancelSplit,
  onApplySplit,
  onRowClick,
  onRowMouseDown,
  onRowDoubleClick,
  onLabelDoubleClick,
}: {
  entry: TokenEntry;
  selected: boolean;
  dragging?: boolean;
  aliasPickActive?: boolean;
  grammarEditActive?: boolean;
  splittingActive?: boolean;
  splitError?: string | null;
  labelRef?: React.Ref<HTMLSpanElement>;
  onRemove: () => void;
  onStartSplit?: () => void;
  onCancelSplit?: () => void;
  onApplySplit?: () => void;
  onRowClick: (e: React.MouseEvent) => void;
  onRowMouseDown: (e: React.MouseEvent) => void;
  onRowDoubleClick?: () => void;
  onLabelDoubleClick?: (e: React.MouseEvent) => void;
}) {
  const pickable = Boolean(aliasPickActive);

  return (
    <div
      role="option"
      aria-selected={selected}
      data-select-id={entry.text}
      data-selected={selected ? 'true' : 'false'}
      onClick={onRowClick}
      onMouseDown={onRowMouseDown}
      onDoubleClick={splittingActive ? undefined : onRowDoubleClick}
      className={`group flex items-center gap-1.5 px-2 py-1 rounded ${
        splittingActive ? 'select-text' : 'select-none'
      } ${
        pickable
          ? 'cursor-pointer hover:bg-sky-400/15 hover:ring-1 hover:ring-sky-400/40'
          : splittingActive
            ? 'bg-amber-500/15 ring-1 ring-amber-400/45 cursor-text'
            : selected
              ? dragging
                ? 'bg-emerald-500/35 ring-2 ring-emerald-300/80 opacity-90 cursor-grabbing'
                : 'bg-emerald-500/30 ring-2 ring-emerald-400/70 cursor-grab'
              : grammarEditActive
                ? 'bg-sky-400/20 ring-1 ring-sky-400/50 cursor-pointer'
                : 'hover:bg-[#0f1a12] cursor-default'
      }`}
    >
      <Circle className={`w-2 h-2 flex-shrink-0 ${entry.enabled ? 'text-amber-400/80 fill-amber-400/40' : 'text-emerald-400/25'}`} />
      <div className="flex items-center gap-1 min-w-0">
        <span
          ref={labelRef}
          onDoubleClick={onLabelDoubleClick}
          className={`min-w-0 ${TREE_LABEL} ${
            splittingActive ? '' : 'truncate'
          } ${entry.enabled ? 'text-emerald-200/90' : 'text-emerald-400/65'}`}
          title={splitError ?? entry.text}
        >
          {entry.text}
        </span>
        {!pickable && !splittingActive && (
          <>
            {onStartSplit && (
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onStartSplit();
                }}
                className="flex-shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 text-amber-400/60 hover:text-amber-300 hover:bg-amber-400/10 transition-all"
                title="Dividi token"
              >
                <Scissors className="w-3 h-3" />
              </button>
            )}
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="flex-shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 text-red-400/60 hover:text-red-300 hover:bg-red-400/10 transition-all"
              title="Rimuovi token"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </>
        )}
        {splittingActive && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onCancelSplit?.();
              }}
              className={`${TREE_LABEL} px-1 py-0.5 rounded text-emerald-400/55 hover:text-emerald-200 hover:bg-[#0f1a12]`}
              title="Annulla (ESC)"
            >
              ESC
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onApplySplit?.();
              }}
              className={`${TREE_LABEL} px-1.5 py-0.5 rounded border border-amber-400/40 text-amber-200/90 hover:bg-amber-400/15`}
              title="Dividi in due token"
            >
              Dividi
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const MemoTokenRow = memo(TokenRow);

function CategoryRow({
  id,
  name,
  count,
  iconKey,
  iconColor,
  active,
  dropHighlight,
  draggable,
  onSelect,
  onDelete,
  onMoveToLibrary,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: {
  id: string;
  name: string;
  count: number;
  iconKey: string;
  iconColor: string;
  active: boolean;
  dropHighlight: boolean;
  draggable: boolean;
  onSelect: () => void;
  onDelete?: () => void;
  onMoveToLibrary?: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const isNoCategory = id === NO_CATEGORY_SENTINEL;

  return (
    <div
      data-category-id={id}
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      className={`group flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer transition-colors ${
        active
          ? 'ring-1'
          : dropHighlight
            ? 'bg-sky-400/20 ring-1 ring-sky-400/50'
            : 'hover:bg-[#0f1a12]'
      }`}
      style={active ? {
        backgroundColor: `${iconColor}24`,
        boxShadow: `inset 0 0 0 1px ${iconColor}66`,
      } : undefined}
    >
      {draggable && (
        <GripVertical className="w-2.5 h-2.5 flex-shrink-0 text-emerald-400/30 opacity-0 group-hover:opacity-100" />
      )}
      <DictionaryIcon
        iconKey={iconKey}
        iconColor={iconColor}
        size="lg"
        title={name}
      />
      <span
        className={`${TREE_LABEL} whitespace-nowrap ${
          isNoCategory ? 'text-emerald-300/80 italic' : 'font-semibold'
        }`}
        style={isNoCategory ? undefined : { color: iconColor }}
      >
        {name}
      </span>
      <span className={`${TREE_LABEL} text-emerald-400/80 tabular-nums`}>{count}</span>
      {onMoveToLibrary && count > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMoveToLibrary();
          }}
          className="flex-shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 text-sky-400/60 hover:text-sky-200 hover:bg-sky-400/10 transition-all"
          title="Sposta categoria in libreria"
        >
          <Library className="w-3 h-3" />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="flex-shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 text-red-400/50 hover:text-red-300 hover:bg-red-400/10 transition-all"
          title="Elimina categoria"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

export function TokenTreeEditor({
  tokens,
  categories,
  onTokensChange,
  onCategoriesChange,
  onRemoveCanonical,
  onRemoveAlias,
  aliasPickActive = false,
  aliasPickPhrase = null,
  onAliasTargetPick,
  onCancelAliasPick,
  grammarPanelOpen = false,
  onToggleGrammarPanel,
  grammarEditToken = null,
  onGrammarEditTokenChange,
  showDictionaryHeader = true,
  focusTokenText = null,
  onFocusTokenHandled,
  onMoveCategoryToLibrary,
}: TokenTreeEditorProps) {
  const selected = useDictionarySelectedSet();
  const dictionaryCategoryDropTarget = useDictionaryDropTarget();
  const dictionaryTokenDragActive = useDictionaryDragActive();
  const { setSelected, setDropTarget, setDragActive } = useDictionarySelectionActions();

  const [activeCategoryKey, setActiveCategoryKey] = useState<string>(NO_CATEGORY_SENTINEL);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newTokenName, setNewTokenName] = useState('');
  const [dropTargetCategory, setDropTargetCategory] = useState<string | null>(null);
  const [categoryDropIndex, setCategoryDropIndex] = useState<number | null>(null);
  const [tokenDragActive, setTokenDragActive] = useState(false);
  const [splittingTokenText, setSplittingTokenText] = useState<string | null>(null);
  const [splitError, setSplitError] = useState<string | null>(null);
  const dragGhostRef = useRef<HTMLDivElement>(null);
  const tokenListRef = useRef<HTMLDivElement>(null);
  const splitLabelRef = useRef<HTMLSpanElement>(null);

  const sortedCategories = useMemo(
    () => normalizeCategoryOrders(categories),
    [categories],
  );

  const entryByText = useMemo(() => {
    const map = new Map<string, TokenEntry>();
    for (const t of tokens) map.set(t.text, t);
    return map;
  }, [tokens]);

  const rootTexts = useMemo(
    () => rootTokenTexts(tokens, categories),
    [tokens, categories],
  );

  const visibleTokenTexts = useMemo(
    () => tokenTextsForCategoryView(activeCategoryKey, tokens, categories),
    [activeCategoryKey, tokens, categories],
  );

  /** Only rows actually rendered — keeps selection index range aligned with the list. */
  const selectableTokenTexts = useMemo(
    () => visibleTokenTexts.filter((text) => entryByText.has(text)),
    [visibleTokenTexts, entryByText],
  );

  const allCanonicalTexts = useMemo(
    () => tokens.filter((t) => isCanonicalToken(t)).map((t) => t.text),
    [tokens],
  );

  const {
    selectedList,
    clearSelection,
    selectAll,
    handleRowClick,
  } = useListSelection(selectableTokenTexts, {
    selected: selected as Set<string>,
    setSelected,
    validIds: allCanonicalTexts,
  });

  const { containerRef: tokenScrollRef, range: tokenRange } = useCorpusVirtualScroll(
    selectableTokenTexts.length,
    TOKEN_ROW_HEIGHT_PX,
  );

  const renderedTokenTexts = useMemo(
    () => selectableTokenTexts.slice(tokenRange.start, tokenRange.end),
    [selectableTokenTexts, tokenRange.start, tokenRange.end],
  );

  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  useEffect(() => {
    if (tokenScrollRef.current) tokenScrollRef.current.scrollTop = 0;
  }, [activeCategoryKey, tokenScrollRef]);

  useEffect(() => {
    setSplittingTokenText(null);
    setSplitError(null);
  }, [activeCategoryKey]);

  useEffect(() => {
    if (!splittingTokenText) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSplittingTokenText(null);
        setSplitError(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [splittingTokenText]);

  useEffect(() => {
    if (!focusTokenText) return;
    if (!entryByText.has(focusTokenText)) return;
    setSelected(new Set([focusTokenText]));
    const index = selectableTokenTexts.indexOf(focusTokenText);
    requestAnimationFrame(() => {
      if (index >= 0 && tokenScrollRef.current) {
        tokenScrollRef.current.scrollTop = Math.max(0, index * TOKEN_ROW_HEIGHT_PX - 40);
      }
      const escaped = focusTokenText.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const el = tokenScrollRef.current?.querySelector(`[data-select-id="${escaped}"]`);
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      onFocusTokenHandled?.();
    });
  }, [focusTokenText, entryByText, setSelected, onFocusTokenHandled, selectableTokenTexts, tokenScrollRef]);

  const allVisibleSelected = selectableTokenTexts.length > 0
    && selectableTokenTexts.every((text) => selected.has(text));

  const handleToggleAllTokens = useCallback(() => {
    if (allVisibleSelected) clearSelection();
    else selectAll();
  }, [allVisibleSelected, clearSelection, selectAll]);

  const aliasEntries = useMemo(
    () =>
      tokens
        .filter((t) => t.aliasOf)
        .sort((a, b) => a.text.localeCompare(b.text, 'it', { sensitivity: 'base' })),
    [tokens],
  );

  const canonicalCount = useMemo(
    () => tokens.filter((t) => !t.aliasOf).length,
    [tokens],
  );

  useEffect(() => {
    if (activeCategoryKey === NO_CATEGORY_SENTINEL) return;
    if (!sortedCategories.some((c) => c.id === activeCategoryKey)) {
      setActiveCategoryKey(NO_CATEGORY_SENTINEL);
    }
  }, [activeCategoryKey, sortedCategories]);

  const handleAddCategory = useCallback(() => {
    const name = newCategoryName.trim();
    if (!name) return;

    const existing = findCategoryByName(categories, name);
    if (existing) {
      setActiveCategoryKey(existing.id);
      setNewCategoryName('');
      return;
    }

    try {
      const next = createCategoryWithTokens(categories, name, []);
      const created = findCategoryByName(next, name);
      setNewCategoryName('');
      if (created) setActiveCategoryKey(created.id);
      onCategoriesChange(next);
    } catch {
      /* invalid */
    }
  }, [categories, newCategoryName, onCategoriesChange]);

  const handleAddToken = useCallback(() => {
    const raw = newTokenName.trim();
    if (!raw) return;

    const phrase = selectionToTokenPhrase(raw);
    if (!phrase) return;

    const exists = tokens.some((t) => t.text === phrase && isCanonicalToken(t));
    if (!exists) {
      try {
        onTokensChange(addToken(tokens, raw));
      } catch {
        return;
      }
    }

    try {
      if (activeCategoryKey === NO_CATEGORY_SENTINEL) {
        onCategoriesChange(moveTokensToRoot(categories, [phrase]));
      } else {
        onCategoriesChange(addTokenToCategorySorted(categories, activeCategoryKey, phrase));
      }
    } catch {
      return;
    }

    setSelected(new Set([phrase]));
    setNewTokenName('');
  }, [
    activeCategoryKey,
    categories,
    newTokenName,
    onCategoriesChange,
    onTokensChange,
    setSelected,
    tokens,
  ]);

  const handleDeleteCategory = useCallback((categoryId: string) => {
    try {
      onCategoriesChange(deleteCategoryIfEmpty(categories, categoryId));
      if (activeCategoryKey === categoryId) {
        setActiveCategoryKey(NO_CATEGORY_SENTINEL);
      }
    } catch {
      /* not empty */
    }
  }, [activeCategoryKey, categories, onCategoriesChange]);

  const moveTokensToTarget = useCallback((targetKey: string, tokenTexts: string[]) => {
    if (tokenTexts.length === 0) return;
    try {
      onCategoriesChange(assignTokensToCategory(categories, targetKey, tokenTexts));
      setSelected((prev) => {
        const next = new Set(prev);
        for (const text of tokenTexts) next.delete(text);
        return next;
      });
    } catch {
      /* invalid */
    }
  }, [categories, onCategoriesChange, setSelected]);

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

  /** Off-screen element for HTML5 setDragImage and pointer-drag preview (portaled to body). */
  const prepareDragImage = useCallback((label: string): HTMLDivElement | null => {
    const ghost = dragGhostRef.current;
    if (!ghost) return null;
    ghost.textContent = label;
    ghost.style.left = '-9999px';
    ghost.style.top = '0';
    ghost.style.visibility = 'visible';
    return ghost;
  }, []);

  const startTokenPointerDrag = useCallback((e: React.MouseEvent, tokenText: string) => {
    if ((e.target as HTMLElement).closest('button, input, a')) return;

    const texts = selectedRef.current.has(tokenText)
      ? [...selectedRef.current]
      : [tokenText];
    const originX = e.clientX;
    const originY = e.clientY;
    let active = false;

    const onMove = (ev: MouseEvent) => {
      if (!active) {
        if (Math.hypot(ev.clientX - originX, ev.clientY - originY) < DRAG_THRESHOLD_PX) return;
        active = true;
        setTokenDragActive(true);
        setDragActive(true);
        showDragGhost(formatDragGhostLabel(texts), ev.clientX, ev.clientY);
      } else {
        showDragGhost(formatDragGhostLabel(texts), ev.clientX, ev.clientY);
        const catId = categoryIdAtPoint(ev.clientX, ev.clientY);
        setDropTargetCategory(catId);
        setDropTarget(catId);
      }
    };

    const onUp = (ev: MouseEvent) => {
      if (active) {
        const catId = categoryIdAtPoint(ev.clientX, ev.clientY);
        if (catId) moveTokensToTarget(catId, texts);
      }
      setTokenDragActive(false);
      setDragActive(false);
      setDropTargetCategory(null);
      setDropTarget(null);
      hideDragGhost();
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [
    hideDragGhost,
    moveTokensToTarget,
    setDropTarget,
    setDragActive,
    showDragGhost,
  ]);

  const handleTokenDragEnd = useCallback(() => {
    setTokenDragActive(false);
    setDragActive(false);
    setDropTargetCategory(null);
    setDropTarget(null);
    hideDragGhost();
  }, [hideDragGhost, setDragActive, setDropTarget]);

  const handleCategoryDragStart = useCallback((
    e: React.DragEvent,
    categoryId: string,
    categoryName: string,
  ) => {
    e.dataTransfer.setData(CATEGORY_DRAG_MIME, categoryId);
    e.dataTransfer.effectAllowed = 'move';
    const ghost = prepareDragImage(categoryName);
    if (ghost) {
      e.dataTransfer.setDragImage(ghost, 12, 16);
    }
  }, [prepareDragImage]);

  const handleCategoryDragOver = useCallback((
    e: React.DragEvent,
    categoryKey: string,
    index?: number,
  ) => {
    const isToken = isTokenDragEvent(e);
    const isCategory = e.dataTransfer.types.includes(CATEGORY_DRAG_MIME);
    if (!isToken && !isCategory) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (isToken) {
      setDropTargetCategory(categoryKey);
      setDropTarget(categoryKey);
      setCategoryDropIndex(null);
    } else if (isCategory && typeof index === 'number') {
      setCategoryDropIndex(index);
      setDropTargetCategory(null);
    }
  }, [setDropTarget]);

  const handleCategoryDrop = useCallback((e: React.DragEvent, categoryKey: string, index?: number) => {
    e.preventDefault();
    setDropTargetCategory(null);
    setDropTarget(null);
    setCategoryDropIndex(null);

    const texts = parseTokenDragPayload(e);
    if (texts) {
      moveTokensToTarget(categoryKey, texts);
      handleTokenDragEnd();
      return;
    }

    const draggedCategoryId = e.dataTransfer.getData(CATEGORY_DRAG_MIME);
    if (draggedCategoryId && typeof index === 'number') {
      onCategoriesChange(reorderCategoryToIndex(categories, draggedCategoryId, index));
    }
  }, [categories, handleTokenDragEnd, moveTokensToTarget, onCategoriesChange, setDropTarget]);

  const effectiveDropTarget = dropTargetCategory ?? dictionaryCategoryDropTarget;
  const anyTokenDragActive = tokenDragActive || dictionaryTokenDragActive;

  const grammarRowProps = (text: string) => ({
    grammarEditActive: grammarPanelOpen && grammarEditToken === text,
  });

  /** Single mousedown entry point — event delegation, no per-row handlers. */
  const cancelTokenSplit = useCallback(() => {
    setSplittingTokenText(null);
    setSplitError(null);
  }, []);

  const startTokenSplit = useCallback((text: string) => {
    setSplittingTokenText(text);
    setSplitError(null);
    setSelected(new Set([text]));
    onGrammarEditTokenChange?.(null);
  }, [onGrammarEditTokenChange, setSelected]);

  const applyTokenSplit = useCallback(() => {
    if (!splittingTokenText) return;
    const container = splitLabelRef.current;
    if (!container) {
      setSplitError('Seleziona una parte del token');
      return;
    }
    try {
      const range = getSelectionOffsetsInElement(container, splittingTokenText);
      if (!range) {
        setSplitError('Seleziona una parte del token da separare');
        return;
      }
      const parts = splitPartsFromTokenSelection(splittingTokenText, range.start, range.end);
      const result = applyCanonicalTokenSplit(tokens, categories, splittingTokenText, parts);
      onTokensChange(result.tokens);
      onCategoriesChange(result.categories);
      setSplittingTokenText(null);
      setSplitError(null);
      setSelected(new Set([parts.head, parts.tail]));
    } catch (err) {
      setSplitError(err instanceof Error ? err.message : 'Divisione non valida');
    }
  }, [categories, onCategoriesChange, onTokensChange, setSelected, splittingTokenText, tokens]);

  const handleSplitLabelDoubleClick = useCallback((e: React.MouseEvent, text: string) => {
    e.stopPropagation();
    if (splittingTokenText !== text) return;
    const words = tokenizeToWords(text);
    if (words.length < 2) return;
    const first = words[0]!;
    const start = text.indexOf(first);
    if (start < 0) return;
    const container = e.currentTarget as HTMLElement;
    const textNode = container.firstChild;
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;
    const range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, start + first.length);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    setSplitError(null);
  }, [splittingTokenText]);

  const handleTokenRowClick = useCallback((e: React.MouseEvent, text: string) => {
    if (aliasPickActive) {
      onAliasTargetPick?.(text);
      return;
    }
    if (splittingTokenText && splittingTokenText !== text) {
      cancelTokenSplit();
    }
    e.stopPropagation();
    handleRowClick(e, text);
  }, [aliasPickActive, cancelTokenSplit, handleRowClick, onAliasTargetPick, splittingTokenText]);

  /** Drag: mousedown selects the row when needed, then starts pointer drag to categories. */
  const handleTokenRowMouseDown = useCallback((e: React.MouseEvent, text: string) => {
    if (splittingTokenText) return;
    if (aliasPickActive) return;
    if (e.button !== 0) return;
    if (e.shiftKey || e.ctrlKey || e.metaKey) return;
    if ((e.target as HTMLElement).closest('button, input, a, label')) return;

    if (!selectedRef.current.has(text)) {
      const next = new Set([text]);
      selectedRef.current = next;
      setSelected(next);
    }

    e.preventDefault();
    e.stopPropagation();
    startTokenPointerDrag(e, text);
  }, [aliasPickActive, setSelected, splittingTokenText, startTokenPointerDrag]);

  const handleTokenListBackgroundClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-select-id]')) return;
    clearSelection();
  }, [clearSelection]);

  const activeCategoryLabel = activeCategoryKey === NO_CATEGORY_SENTINEL
    ? 'no category'
    : sortedCategories.find((c) => c.id === activeCategoryKey)?.name ?? '—';

  return (
    <div className="flex flex-col h-full min-h-0">
      {(showDictionaryHeader || aliasPickActive) && (
      <div className="flex-shrink-0 px-3 py-1.5 border-b border-[#1a3a2a] bg-[#0a1510] font-mono text-[10px] uppercase tracking-wider">
        {aliasPickActive ? (
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-0.5 min-w-0">
              <p className="text-sky-300/90">Alias of…</p>
              <p className="text-[9px] text-emerald-400/45 normal-case truncate" title={aliasPickPhrase ?? undefined}>
                {aliasPickPhrase}
              </p>
              <p className="text-[8px] text-sky-400/50 normal-case">Clicca un token · ESC annulla</p>
            </div>
            {onCancelAliasPick && (
              <button
                type="button"
                onClick={onCancelAliasPick}
                className="flex-shrink-0 font-mono text-[9px] text-emerald-400/50 hover:text-emerald-300 px-1"
                title="Annulla (ESC)"
              >
                ESC
              </button>
            )}
          </div>
        ) : showDictionaryHeader ? (
          <div className="flex items-center justify-between gap-2 w-full">
            <span className="text-sky-400/50 truncate">
              Dizionario ({canonicalCount}) · {sortedCategories.length} categorie
            </span>
            {onToggleGrammarPanel && (
              <button
                type="button"
                onClick={onToggleGrammarPanel}
                title={grammarPanelOpen ? 'Chiudi editor sinonimi' : 'Editor sinonimi token'}
                className={`flex-shrink-0 p-1 rounded border transition-colors ${
                  grammarPanelOpen
                    ? 'border-sky-400/50 bg-sky-400/15 text-sky-300'
                    : 'border-[#1a3a2a] text-emerald-400/45 hover:border-sky-400/35 hover:text-sky-300/80'
                }`}
              >
                <Braces className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ) : null}
      </div>
      )}

      <div className="flex-1 min-h-0 flex border-b border-[#1a3a2a]">
        {/* Categories panel — width follows longest category name */}
        <div className="flex-shrink-0 w-max flex flex-col border-r border-[#1a3a2a]">
          <div className="flex-shrink-0 p-1.5 border-b border-[#1a3a2a] bg-[#0a1510]">
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                placeholder="Nuova categoria…"
                className="flex-1 min-w-0 bg-[#080e0a] border border-[#1a3a2a] rounded px-2 py-1 font-mono text-[10px] text-emerald-200 placeholder:text-emerald-300/70 focus:outline-none focus:border-sky-400/40"
              />
              <button
                type="button"
                onClick={handleAddCategory}
                disabled={!newCategoryName.trim()}
                className="flex items-center gap-0.5 px-1.5 py-1 font-mono text-[9px] rounded border border-sky-400/30 text-sky-300/90 hover:bg-sky-400/10 disabled:opacity-40"
                title="Aggiungi categoria"
              >
                <FolderPlus className="w-3 h-3" />
              </button>
            </div>
          </div>
          <div className={`flex-shrink-0 px-2 py-1 ${TREE_LABEL} text-emerald-300/90 uppercase tracking-wider`}>
            Categorie
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-1 space-y-0.5">
            <CategoryRow
              id={NO_CATEGORY_SENTINEL}
              name="no category"
              count={rootTexts.length}
              iconKey={NO_CATEGORY_ICON.iconKey}
              iconColor={NO_CATEGORY_ICON.iconColor}
              active={activeCategoryKey === NO_CATEGORY_SENTINEL}
              dropHighlight={effectiveDropTarget === NO_CATEGORY_SENTINEL}
              draggable={false}
              onSelect={() => setActiveCategoryKey(NO_CATEGORY_SENTINEL)}
              onDragOver={(e) => handleCategoryDragOver(e, NO_CATEGORY_SENTINEL)}
              onDragLeave={() => setDropTargetCategory(null)}
              onDrop={(e) => handleCategoryDrop(e, NO_CATEGORY_SENTINEL)}
              onDragStart={() => {}}
              onDragEnd={() => setDropTargetCategory(null)}
            />
            {sortedCategories.map((cat, index) => (
              <div key={cat.id}>
                {categoryDropIndex === index && (
                  <div className="h-0.5 bg-amber-400/60 rounded mx-1 my-0.5" />
                )}
                <CategoryRow
                  id={cat.id}
                  name={cat.name}
                  count={cat.tokenTexts.length}
                  iconKey={iconForCategory(cat).iconKey}
                  iconColor={iconForCategory(cat).iconColor}
                  active={activeCategoryKey === cat.id}
                  dropHighlight={effectiveDropTarget === cat.id}
                  draggable
                  onSelect={() => setActiveCategoryKey(cat.id)}
                  onDelete={
                    cat.tokenTexts.length === 0
                      ? () => handleDeleteCategory(cat.id)
                      : undefined
                  }
                  onMoveToLibrary={
                    onMoveCategoryToLibrary
                      ? () => onMoveCategoryToLibrary(cat.id, cat.name, cat.tokenTexts.length)
                      : undefined
                  }
                  onDragStart={(e) => handleCategoryDragStart(e, cat.id, cat.name)}
                  onDragOver={(e) => handleCategoryDragOver(e, cat.id, index)}
                  onDragLeave={() => {
                    setDropTargetCategory(null);
                    setCategoryDropIndex(null);
                  }}
                  onDrop={(e) => handleCategoryDrop(e, cat.id, index)}
                  onDragEnd={() => {
                    hideDragGhost();
                    setDropTargetCategory(null);
                    setCategoryDropIndex(null);
                  }}
                />
              </div>
            ))}
            {categoryDropIndex === sortedCategories.length && (
              <div className="h-0.5 bg-amber-400/60 rounded mx-1 my-0.5" />
            )}
          </div>
        </div>

        {/* Tokens panel */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex-shrink-0 px-1.5 pt-1.5 pb-1 border-b border-[#1a3a2a] bg-[#0a1510]">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newTokenName}
                onChange={(e) => setNewTokenName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddToken()}
                placeholder="Nuovo token…"
                className="flex-1 min-w-0 bg-[#080e0a] border border-[#1a3a2a] rounded px-2 py-1 font-mono text-[10px] text-emerald-200 placeholder:text-emerald-300/70 focus:outline-none focus:border-sky-400/40"
              />
              <label
                className={`flex items-center gap-1.5 flex-shrink-0 cursor-pointer select-none ${
                  selectableTokenTexts.length === 0 ? 'cursor-not-allowed' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  disabled={selectableTokenTexts.length === 0}
                  onChange={handleToggleAllTokens}
                  className="w-3.5 h-3.5 rounded border-[#1a3a2a] bg-[#080e0a] accent-emerald-400 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                  title={allVisibleSelected ? 'Deseleziona tutti i token' : 'Seleziona tutti i token'}
                />
                <span className={`font-mono text-[9px] uppercase tracking-wide ${
                  selectableTokenTexts.length === 0 ? 'text-emerald-400/55' : 'text-emerald-200'
                }`}>
                  tutti
                </span>
              </label>
              <button
                type="button"
                onClick={handleAddToken}
                disabled={!newTokenName.trim()}
                className="flex items-center gap-0.5 px-1.5 py-1 font-mono text-[9px] rounded border border-amber-400/50 text-amber-100 hover:bg-amber-400/15 disabled:opacity-40 flex-shrink-0"
                title="Aggiungi token alla categoria attiva"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>
          <div className="flex-shrink-0 px-2 py-1 flex items-center gap-2 border-b border-[#1a3a2a]/60">
            <span
              className={`${TREE_LABEL} text-amber-300/95 uppercase tracking-wider whitespace-nowrap min-w-0 flex-1`}
            >
              {activeCategoryLabel}
            </span>
            {selectedList.length > 0 && (
              <span className={`${TREE_LABEL} text-emerald-300/85 flex-shrink-0`}>
                {selectedList.length} sel.
              </span>
            )}
          </div>
          <div
            ref={tokenScrollRef}
            role="listbox"
            aria-multiselectable
            className="flex-1 min-h-0 overflow-y-auto p-1"
            onClick={handleTokenListBackgroundClick}
          >
            {selectableTokenTexts.length === 0 ? (
              <p className={`${TREE_LABEL} text-emerald-300/90 px-2 py-4 text-center leading-relaxed`}>
                Nessun token in questa categoria.
              </p>
            ) : (
              <div
                ref={tokenListRef}
                style={{ height: tokenRange.totalHeight, position: 'relative' }}
              >
                <div
                  className="space-y-0.5 absolute left-0 right-0 p-0"
                  style={{
                    transform: `translateY(${tokenRange.offsetY}px)`,
                    willChange: 'transform',
                  }}
                >
                  {renderedTokenTexts.map((text) => {
                    const entry = entryByText.get(text);
                    if (!entry) return null;
                    const isSelected = selected.has(text);
                    return (
                      <div
                        key={text}
                        style={{ minHeight: TOKEN_ROW_HEIGHT_PX }}
                        draggable={!aliasPickActive && !splittingTokenText}
                        onDragStart={(e) => {
                          const dragTexts = isSelected ? [...selected] : [text];
                          if (!isSelected) {
                            const next = new Set([text]);
                            selectedRef.current = next;
                            setSelected(next);
                          }
                          const payload = tokenDragPayload(dragTexts);
                          e.dataTransfer.setData(TOKEN_DRAG_MIME, payload);
                          e.dataTransfer.setData('text/plain', `${TOKEN_DRAG_PLAIN_PREFIX}${payload}`);
                          e.dataTransfer.effectAllowed = 'move';
                          setTokenDragActive(true);
                          setDragActive(true);
                          const ghost = prepareDragImage(formatDragGhostLabel(dragTexts));
                          if (ghost) e.dataTransfer.setDragImage(ghost, 12, 16);
                        }}
                        onDragEnd={handleTokenDragEnd}
                      >
                        <MemoTokenRow
                          entry={entry}
                          selected={isSelected}
                          dragging={anyTokenDragActive && isSelected}
                          aliasPickActive={aliasPickActive}
                          splittingActive={splittingTokenText === text}
                          splitError={splittingTokenText === text ? splitError : null}
                          labelRef={splittingTokenText === text ? splitLabelRef : undefined}
                          {...grammarRowProps(text)}
                          onRemove={() => onRemoveCanonical(text)}
                          onStartSplit={
                            isCanonicalToken(entry) && tokenizeToWords(entry.text).length >= 2
                              ? () => startTokenSplit(text)
                              : undefined
                          }
                          onCancelSplit={cancelTokenSplit}
                          onApplySplit={applyTokenSplit}
                          onRowClick={(e) => handleTokenRowClick(e, text)}
                          onRowMouseDown={(e) => handleTokenRowMouseDown(e, text)}
                          onLabelDoubleClick={(e) => handleSplitLabelDoubleClick(e, text)}
                          onRowDoubleClick={
                            grammarPanelOpen && onGrammarEditTokenChange && splittingTokenText !== text
                              ? () => onGrammarEditTokenChange(text)
                              : undefined
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <div className={`flex-shrink-0 px-2 py-0.5 border-t border-[#1a3a2a]/60 ${TREE_LABEL} text-emerald-400/75`}>
            {splittingTokenText
              ? 'Seleziona testo nel token · Doppio click prima parola · Dividi · ESC annulla'
              : 'Click seleziona · Forbici dividi token · trascina su categoria · Ctrl/Shift multi-selezione'}
          </div>
        </div>
      </div>

      {typeof document !== 'undefined' && createPortal(
        <div
          ref={dragGhostRef}
          aria-hidden
          className="fixed z-[10000] pointer-events-none px-3 py-2 rounded-md border border-sky-400/50 bg-[#0a1510] shadow-xl font-mono text-[11px] text-sky-100 max-w-[220px] truncate whitespace-nowrap"
          style={{ left: -9999, top: 0, visibility: 'hidden' }}
        />,
        document.body,
      )}

      {aliasEntries.length > 0 && (
        <div className="flex-shrink-0 max-h-[28%] overflow-y-auto border-t border-[#1a3a2a]/60 bg-[#080e0a]">
          <p className={`sticky top-0 px-2 py-1 ${TREE_LABEL} uppercase tracking-wider text-sky-400/45 bg-[#080e0a] border-b border-[#1a3a2a]/40`}>
            Alias ({aliasEntries.length})
          </p>
          <div className="p-1 space-y-0.5">
            {aliasEntries.map((entry) => (
              <div
                key={entry.text}
                className="group flex items-center gap-1.5 px-2 py-1 rounded hover:bg-[#0f1a12] transition-colors"
                title={`alias of: ${entry.aliasOf}`}
              >
                <Circle className="w-2 h-2 flex-shrink-0 text-sky-400/60 fill-sky-400/25" />
                <span className={`flex-1 min-w-0 ${TREE_LABEL} text-sky-200/90 truncate`}>
                  {entry.text}
                  {entry.aliasOf && (
                    <span className="text-sky-300/45"> ({aliasCanonicalHint(entry.aliasOf)})</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveAlias(entry.text)}
                  className="flex-shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 text-red-400/60 hover:text-red-300 hover:bg-red-400/10 transition-all"
                  title="Rimuovi alias"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
