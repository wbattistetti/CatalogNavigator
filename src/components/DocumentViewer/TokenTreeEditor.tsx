/**
 * Two-panel dictionary editor: categories (left) and tokens (right).
 * Explorer-style token selection and pointer drag to categories; category reorder DnD.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Circle, Trash2, FolderPlus, Braces, Plus, GripVertical, Library, Scissors, Pencil, Check, X,
  ChevronUp, ChevronDown,
} from 'lucide-react';
import { DictionaryIcon } from './DictionaryIcon';
import { iconForCategory, NO_CATEGORY_ICON, VINCOLO_CATEGORY_BADGE } from '../../lib/categoryIconCatalog';
import type { CategoryType, TokenCategory } from '../../lib/dictionaryTree';
import {
  NO_CATEGORY_SENTINEL,
  createCategoryWithTokens,
  deleteCategoryIfEmpty,
  findCategoryByName,
  normalizeCategoryOrders,
  normalizeCategoryType,
  reorderCategory,
  reorderCategoryToIndex,
  rootTokenTexts,
  setCategoryType,
  tokenTextsForCategoryView,
} from '../../lib/dictionaryTree';
import {
  aliasCanonicalHint,
  getSelectionOffsetsInElement,
  isCanonicalToken,
  tokenizeToWords,
  type TokenEntry,
} from '../../lib/tokenDictionary';
import { applyCanonicalTokenSplit, splitPartsFromTokenSelection } from '../../lib/splitCanonicalToken';
import {
  applyCanonicalConceptEdit,
  applyNewConceptLine,
  formatConceptEditorLine,
  listAliasesForCanonical,
} from '../../lib/tokenConceptEditor';
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
  grammarEditCategoryId?: string | null;
  onGrammarEditCategoryChange?: (categoryId: string | null) => void;
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

const CATEGORIES_PANEL_MIN_PX = 120;
const CATEGORIES_PANEL_MAX_RATIO = 0.55;
const CATEGORIES_PANEL_DEFAULT_PX = 200;
const CATEGORIES_PANEL_WIDTH_KEY = 'agent-browser.tokenTreeEditor.categoriesWidth';

function readStoredCategoriesPanelWidth(): number {
  if (typeof window === 'undefined') return CATEGORIES_PANEL_DEFAULT_PX;
  try {
    const raw = localStorage.getItem(CATEGORIES_PANEL_WIDTH_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n >= CATEGORIES_PANEL_MIN_PX ? n : CATEGORIES_PANEL_DEFAULT_PX;
  } catch {
    return CATEGORIES_PANEL_DEFAULT_PX;
  }
}

function TokenRow({
  entry,
  selected,
  dragging,
  aliasPickActive,
  splittingActive,
  splitError,
  labelRef,
  editing,
  editValue,
  editError,
  onEditValueChange,
  onStartEdit,
  onConfirmEdit,
  onCancelEdit,
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
  splittingActive?: boolean;
  splitError?: string | null;
  labelRef?: React.Ref<HTMLSpanElement>;
  editing?: boolean;
  editValue?: string;
  editError?: string | null;
  onEditValueChange?: (value: string) => void;
  onStartEdit?: () => void;
  onConfirmEdit?: () => void;
  onCancelEdit?: () => void;
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

  if (editing) {
    return (
      <div
        className="flex flex-col gap-1 px-2 py-1 rounded bg-sky-400/10 ring-1 ring-sky-400/40"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1 min-w-0">
          <input
            autoFocus
            type="text"
            value={editValue ?? ''}
            onChange={(e) => onEditValueChange?.(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onConfirmEdit?.();
              if (e.key === 'Escape') onCancelEdit?.();
            }}
            placeholder="canonico: syn1, syn2"
            title="Canonico o canonico: alias separati da virgola"
            className="flex-1 min-w-0 bg-[#080e0a] border border-sky-400/40 rounded px-2 py-0.5 font-mono text-xs text-emerald-200 placeholder:text-emerald-400/40 focus:outline-none focus:border-sky-400/70"
          />
          <button
            type="button"
            onClick={() => onConfirmEdit?.()}
            className="flex-shrink-0 p-0.5 rounded text-emerald-400/80 hover:text-emerald-300 hover:bg-emerald-400/10"
            title="Salva concetto"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onCancelEdit?.()}
            className="flex-shrink-0 p-0.5 rounded text-emerald-400/40 hover:text-emerald-300/80 hover:bg-emerald-400/10"
            title="Annulla"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        {editError && (
          <p className={`${TREE_LABEL} text-red-300/90 px-0.5`}>{editError}</p>
        )}
      </div>
    );
  }

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
            {onStartEdit && (
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onStartEdit();
                }}
                className="flex-shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 text-sky-400/60 hover:text-sky-300 hover:bg-sky-400/10 transition-all"
                title="Modifica concetto e alias"
              >
                <Pencil className="w-3 h-3" />
              </button>
            )}
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
  categoryType,
  active,
  dropHighlight,
  grammarEditActive,
  draggable,
  onSelect,
  onGrammarEdit,
  onTypeChange,
  onDelete,
  onMoveToLibrary,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
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
  categoryType?: CategoryType;
  active: boolean;
  dropHighlight: boolean;
  grammarEditActive?: boolean;
  draggable: boolean;
  onSelect: () => void;
  onGrammarEdit?: () => void;
  onTypeChange?: (type: CategoryType) => void;
  onDelete?: () => void;
  onMoveToLibrary?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
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
      onDoubleClick={
        onGrammarEdit
          ? (e) => {
            e.stopPropagation();
            onGrammarEdit();
          }
          : undefined
      }
      className={`group flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer transition-colors ${
        grammarEditActive
          ? 'bg-sky-400/20 ring-1 ring-sky-400/50'
          : active
          ? 'ring-1'
          : dropHighlight
            ? 'bg-sky-400/20 ring-1 ring-sky-400/50'
            : 'hover:bg-[#0f1a12]'
      }`}
      style={!grammarEditActive && active ? {
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
        className={`flex-1 min-w-0 truncate ${TREE_LABEL} ${
          isNoCategory ? 'text-emerald-300/80 italic' : 'font-semibold'
        }`}
        style={isNoCategory ? undefined : { color: iconColor }}
        title={name}
      >
        {name}
      </span>
      {categoryType === 'vincolo' && (
        <span
          className="inline-flex items-center gap-0.5 flex-shrink-0 rounded px-1 py-px"
          style={{
            backgroundColor: `${VINCOLO_CATEGORY_BADGE.iconColor}18`,
            boxShadow: `inset 0 0 0 1px ${VINCOLO_CATEGORY_BADGE.iconColor}44`,
          }}
          title="Categoria vincolo: regola di ammissibilità (es. fascia d'età)"
        >
          <DictionaryIcon
            iconKey={VINCOLO_CATEGORY_BADGE.iconKey}
            iconColor={VINCOLO_CATEGORY_BADGE.iconColor}
            size="xs"
            title="Vincolo"
          />
          <span
            className={`${TREE_LABEL} font-semibold uppercase tracking-wide`}
            style={{ color: VINCOLO_CATEGORY_BADGE.iconColor }}
          >
            Vincolo
          </span>
        </span>
      )}
      <span className={`${TREE_LABEL} text-emerald-400/80 tabular-nums`}>{count}</span>
      {onTypeChange && categoryType && (
        <select
          value={categoryType}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onTypeChange(e.target.value as CategoryType)}
          className={`flex-shrink-0 max-w-[6.5rem] opacity-0 group-hover:opacity-100 bg-[#080e0a] border border-[#1a3a2a] rounded px-1 py-0 ${TREE_LABEL} text-emerald-200/90 focus:outline-none focus:border-sky-400/40 ${
            categoryType === 'vincolo' ? 'text-amber-300/90' : ''
          }`}
          title="Tipo categoria: attributo = disambiguazione, vincolo = regola (es. età)"
        >
          <option value="attributo">attributo</option>
          <option value="vincolo">vincolo</option>
        </select>
      )}
      {draggable && (onMoveUp || onMoveDown) && (
        <div className="flex items-center flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {onMoveUp && (
            <button
              type="button"
              disabled={!canMoveUp}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onMoveUp();
              }}
              className="p-0.5 rounded text-emerald-400/55 hover:text-emerald-200 hover:bg-emerald-400/10 disabled:opacity-25 disabled:pointer-events-none"
              title="Sposta su"
            >
              <ChevronUp className="w-3 h-3" />
            </button>
          )}
          {onMoveDown && (
            <button
              type="button"
              disabled={!canMoveDown}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onMoveDown();
              }}
              className="p-0.5 rounded text-emerald-400/55 hover:text-emerald-200 hover:bg-emerald-400/10 disabled:opacity-25 disabled:pointer-events-none"
              title="Sposta giù"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
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
  grammarEditCategoryId = null,
  onGrammarEditCategoryChange,
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
  const [editingCanonical, setEditingCanonical] = useState<string | null>(null);
  const [conceptEditLine, setConceptEditLine] = useState('');
  const [conceptEditError, setConceptEditError] = useState<string | null>(null);
  const dragGhostRef = useRef<HTMLDivElement>(null);
  const tokenListRef = useRef<HTMLDivElement>(null);
  const splitLabelRef = useRef<HTMLSpanElement>(null);
  const categoriesSplitRef = useRef<HTMLDivElement>(null);
  const [categoriesPanelWidth, setCategoriesPanelWidth] = useState(readStoredCategoriesPanelWidth);
  const [categoriesResizing, setCategoriesResizing] = useState(false);

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
        .filter((t) => t.aliasOf && t.aliasOf !== editingCanonical)
        .sort((a, b) => a.text.localeCompare(b.text, 'it', { sensitivity: 'base' })),
    [tokens, editingCanonical],
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

    try {
      const result = applyNewConceptLine(tokens, categories, activeCategoryKey, raw);
      onTokensChange(result.tokens);
      onCategoriesChange(result.categories);
      setSelected(new Set([result.canonical]));
      setNewTokenName('');
    } catch {
      return;
    }
  }, [
    activeCategoryKey,
    categories,
    newTokenName,
    onCategoriesChange,
    onTokensChange,
    setSelected,
    tokens,
  ]);

  const startConceptEdit = useCallback((canonical: string) => {
    setSplittingTokenText(null);
    setSplitError(null);
    setEditingCanonical(canonical);
    setConceptEditLine(formatConceptEditorLine(canonical, listAliasesForCanonical(tokens, canonical)));
    setConceptEditError(null);
  }, [tokens]);

  const cancelConceptEdit = useCallback(() => {
    setEditingCanonical(null);
    setConceptEditLine('');
    setConceptEditError(null);
  }, []);

  const confirmConceptEdit = useCallback(() => {
    if (!editingCanonical) return;
    try {
      const result = applyCanonicalConceptEdit(
        tokens,
        categories,
        editingCanonical,
        conceptEditLine,
      );
      onTokensChange(result.tokens);
      onCategoriesChange(result.categories);
      setSelected(new Set([result.canonical]));
      cancelConceptEdit();
    } catch (err) {
      setConceptEditError(err instanceof Error ? err.message : 'Modifica non valida');
    }
  }, [
    cancelConceptEdit,
    categories,
    conceptEditLine,
    editingCanonical,
    onCategoriesChange,
    onTokensChange,
    setSelected,
    tokens,
  ]);

  const handleCategoryTypeChange = useCallback((categoryId: string, type: CategoryType) => {
    onCategoriesChange(setCategoryType(categories, categoryId, type));
  }, [categories, onCategoriesChange]);

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

  const handleMoveCategory = useCallback((
    categoryId: string,
    direction: 'up' | 'down',
  ) => {
    onCategoriesChange(reorderCategory(categories, categoryId, direction));
  }, [categories, onCategoriesChange]);

  const handleCategoryDragStart = useCallback((
    e: React.DragEvent,
    categoryId: string,
    categoryName: string,
  ) => {
    e.stopPropagation();
    e.dataTransfer.setData(CATEGORY_DRAG_MIME, categoryId);
    e.dataTransfer.setData('text/plain', `${CATEGORY_DRAG_MIME}:${categoryId}`);
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

    let draggedCategoryId = e.dataTransfer.getData(CATEGORY_DRAG_MIME);
    if (!draggedCategoryId) {
      const plain = e.dataTransfer.getData('text/plain');
      if (plain.startsWith(`${CATEGORY_DRAG_MIME}:`)) {
        draggedCategoryId = plain.slice(CATEGORY_DRAG_MIME.length + 1);
      }
    }
    if (draggedCategoryId && typeof index === 'number') {
      onCategoriesChange(reorderCategoryToIndex(categories, draggedCategoryId, index));
    }
  }, [categories, handleTokenDragEnd, moveTokensToTarget, onCategoriesChange, setDropTarget]);

  const effectiveDropTarget = dropTargetCategory ?? dictionaryCategoryDropTarget;
  const anyTokenDragActive = tokenDragActive || dictionaryTokenDragActive;

  const cancelTokenSplit = useCallback(() => {
    setSplittingTokenText(null);
    setSplitError(null);
  }, []);

  const selectCategory = useCallback((categoryKey: string) => {
    setActiveCategoryKey(categoryKey);
    if (
      grammarPanelOpen
      && onGrammarEditCategoryChange
      && categoryKey !== NO_CATEGORY_SENTINEL
    ) {
      onGrammarEditCategoryChange(categoryKey);
    }
  }, [grammarPanelOpen, onGrammarEditCategoryChange]);

  const startTokenSplit = useCallback((text: string) => {
    setSplittingTokenText(text);
    setSplitError(null);
    setSelected(new Set([text]));
  }, [setSelected]);

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

  const onCategoriesSashPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const container = categoriesSplitRef.current;
    if (!container) return;

    setCategoriesResizing(true);
    const startX = e.clientX;
    const startWidth = categoriesPanelWidth;
    const maxWidth = Math.max(
      CATEGORIES_PANEL_MIN_PX,
      container.getBoundingClientRect().width * CATEGORIES_PANEL_MAX_RATIO,
    );

    let lastWidth = startWidth;

    const onMove = (ev: PointerEvent) => {
      lastWidth = Math.min(maxWidth, Math.max(CATEGORIES_PANEL_MIN_PX, startWidth + ev.clientX - startX));
      setCategoriesPanelWidth(lastWidth);
    };

    const onUp = () => {
      setCategoriesResizing(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      try {
        localStorage.setItem(CATEGORIES_PANEL_WIDTH_KEY, String(Math.round(lastWidth)));
      } catch {
        /* ignore quota / private mode */
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [categoriesPanelWidth]);

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
                title={grammarPanelOpen ? 'Chiudi editor sinonimi categoria' : 'Editor sinonimi categoria'}
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

      <div
        ref={categoriesSplitRef}
        className={`flex-1 min-h-0 flex border-b border-[#1a3a2a] ${categoriesResizing ? 'select-none' : ''}`}
      >
        <div
          className="flex-shrink-0 min-h-0 flex flex-col overflow-hidden"
          style={{ width: categoriesPanelWidth }}
        >
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
          <div className="flex-shrink-0 px-2 py-1 border-b border-[#1a3a2a]/40 flex items-center justify-between gap-1">
            <span className={`${TREE_LABEL} text-emerald-300/90 uppercase tracking-wider`}>
              Categorie
            </span>
            {onToggleGrammarPanel && (
              <button
                type="button"
                onClick={onToggleGrammarPanel}
                title={grammarPanelOpen ? 'Chiudi editor sinonimi categoria' : 'Editor sinonimi categoria'}
                className={`flex-shrink-0 p-0.5 rounded border transition-colors ${
                  grammarPanelOpen
                    ? 'border-sky-400/50 bg-sky-400/15 text-sky-300'
                    : 'border-[#1a3a2a] text-emerald-400/45 hover:border-sky-400/35 hover:text-sky-300/80'
                }`}
              >
                <Braces className="w-3 h-3" />
              </button>
            )}
          </div>
          <p className={`flex-shrink-0 px-2 py-1 ${TREE_LABEL} text-emerald-400/65 leading-snug`}>
            Trascina o usa ↑↓ · l&apos;ordine definisce la gerarchia ontologia
          </p>
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
              onSelect={() => selectCategory(NO_CATEGORY_SENTINEL)}
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
                  categoryType={normalizeCategoryType(cat.type)}
                  active={activeCategoryKey === cat.id}
                  dropHighlight={effectiveDropTarget === cat.id}
                  grammarEditActive={grammarPanelOpen && grammarEditCategoryId === cat.id}
                  draggable
                  onSelect={() => selectCategory(cat.id)}
                  onGrammarEdit={
                    grammarPanelOpen
                    && onGrammarEditCategoryChange
                    && cat.type !== 'vincolo'
                    && cat.tokenTexts.length > 0
                      ? () => onGrammarEditCategoryChange(cat.id)
                      : undefined
                  }
                  onTypeChange={(type) => handleCategoryTypeChange(cat.id, type)}
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
                  onMoveUp={() => handleMoveCategory(cat.id, 'up')}
                  onMoveDown={() => handleMoveCategory(cat.id, 'down')}
                  canMoveUp={index > 0}
                  canMoveDown={index < sortedCategories.length - 1}
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
            <div
              className="min-h-[0.75rem]"
              onDragOver={(e) => handleCategoryDragOver(e, 'end', sortedCategories.length)}
              onDragLeave={() => setCategoryDropIndex(null)}
              onDrop={(e) => handleCategoryDrop(e, 'end', sortedCategories.length)}
            >
              {categoryDropIndex === sortedCategories.length && (
                <div className="h-0.5 bg-amber-400/60 rounded mx-1 my-0.5" />
              )}
            </div>
          </div>
        </div>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={categoriesPanelWidth}
          onPointerDown={onCategoriesSashPointerDown}
          className="w-1 flex-shrink-0 cursor-col-resize bg-[#1a3a2a] hover:bg-emerald-400/45 transition-colors"
        />

        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex-shrink-0 px-1.5 pt-1.5 pb-1 border-b border-[#1a3a2a] bg-[#0a1510]">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newTokenName}
                onChange={(e) => setNewTokenName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddToken()}
                placeholder="canonico o canonico: syn1, syn2"
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
                          editing={editingCanonical === text}
                          editValue={editingCanonical === text ? conceptEditLine : undefined}
                          editError={editingCanonical === text ? conceptEditError : null}
                          onEditValueChange={editingCanonical === text ? setConceptEditLine : undefined}
                          onStartEdit={
                            editingCanonical == null && isCanonicalToken(entry)
                              ? () => startConceptEdit(text)
                              : undefined
                          }
                          onConfirmEdit={editingCanonical === text ? confirmConceptEdit : undefined}
                          onCancelEdit={editingCanonical === text ? cancelConceptEdit : undefined}
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
              : grammarPanelOpen
                ? 'Click o doppio click su categoria · modifica sinonimi nel pannello a destra'
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
