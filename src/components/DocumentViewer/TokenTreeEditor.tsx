/**
 * Two-level dictionary tree: categories (folders) and tokens (leaves).
 * Category order drives segment mounting in the segmentation motor.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown, ChevronRight, ChevronUp, Folder, Circle,
  Trash2, FolderPlus, ArrowUpToLine,
} from 'lucide-react';
import type { TokenCategory } from '../../lib/dictionaryTree';
import {
  createCategoryWithTokens,
  deleteCategoryIfEmpty,
  moveTokensToCategory,
  moveTokensToRoot,
  normalizeCategoryOrders,
  reorderCategory,
  rootTokenTexts,
} from '../../lib/dictionaryTree';
import { aliasCanonicalHint, type TokenEntry } from '../../lib/tokenDictionary';

export interface TokenTreeEditorProps {
  tokens: TokenEntry[];
  categories: TokenCategory[];
  onCategoriesChange: (categories: TokenCategory[]) => void;
  onRemoveCanonical: (text: string) => void;
  onRemoveAlias: (text: string) => void;
  aliasPickActive?: boolean;
  aliasPickPhrase?: string | null;
  onAliasTargetPick?: (canonicalText: string) => void;
  onCancelAliasPick?: () => void;
}

interface TokenContextMenu {
  x: number;
  y: number;
  tokenTexts: string[];
}

function TokenRow({
  entry,
  selected,
  aliasPickActive,
  onToggleSelect,
  onRemove,
  onContextMenu,
  onPickAsAliasTarget,
}: {
  entry: TokenEntry;
  selected: boolean;
  aliasPickActive?: boolean;
  onToggleSelect: () => void;
  onRemove: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onPickAsAliasTarget?: () => void;
}) {
  const pickable = aliasPickActive && onPickAsAliasTarget;

  return (
    <div
      className={`group flex items-center gap-1.5 px-2 py-1 rounded transition-colors ${
        pickable
          ? 'cursor-pointer hover:bg-sky-400/15 hover:ring-1 hover:ring-sky-400/40'
          : selected
            ? 'bg-sky-400/15 ring-1 ring-sky-400/35 cursor-default'
            : 'hover:bg-[#0f1a12] cursor-default'
      }`}
      onClick={pickable ? onPickAsAliasTarget : undefined}
      onContextMenu={pickable ? undefined : onContextMenu}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        disabled={pickable}
        className="flex-shrink-0 accent-sky-400 disabled:opacity-30"
        onClick={(e) => e.stopPropagation()}
      />
      <Circle className={`w-2 h-2 flex-shrink-0 ${entry.enabled ? 'text-amber-400/80 fill-amber-400/40' : 'text-emerald-400/25'}`} />
      <span
        className={`flex-1 min-w-0 font-mono text-[10px] truncate ${
          entry.enabled ? 'text-emerald-200/90' : 'text-emerald-400/35'
        }`}
        title={entry.text}
      >
        {entry.text}
      </span>
      {entry.suppressedBy && (
        <span className="font-mono text-[8px] text-emerald-400/30 truncate max-w-[4rem]" title={`Soppresso da ${entry.suppressedBy}`}>
          ↳
        </span>
      )}
      {!pickable && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="flex-shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 text-red-400/60 hover:text-red-300 hover:bg-red-400/10 transition-all"
          title="Rimuovi token"
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
  onCategoriesChange,
  onRemoveCanonical,
  onRemoveAlias,
  aliasPickActive = false,
  aliasPickPhrase = null,
  onAliasTargetPick,
  onCancelAliasPick,
}: TokenTreeEditorProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [newCategoryName, setNewCategoryName] = useState('');
  const [ctxMenu, setCtxMenu] = useState<TokenContextMenu | null>(null);
  const [ctxNewCategoryName, setCtxNewCategoryName] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

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

  const selectedList = useMemo(() => [...selected], [selected]);

  const toggleSelect = useCallback((text: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(text)) next.delete(text);
      else next.add(text);
      return next;
    });
  }, []);

  const toggleCollapsed = useCallback((catId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  }, []);

  const handleCreateCategory = useCallback(() => {
    const name = newCategoryName.trim();
    if (!name) return;
    try {
      onCategoriesChange(createCategoryWithTokens(categories, name, selectedList));
      setNewCategoryName('');
      setSelected(new Set());
    } catch {
      /* invalid */
    }
  }, [categories, newCategoryName, onCategoriesChange, selectedList]);

  const handleMoveToCategory = useCallback((categoryId: string) => {
    if (selectedList.length === 0) return;
    try {
      onCategoriesChange(moveTokensToCategory(categories, categoryId, selectedList));
      setSelected(new Set());
      setCtxMenu(null);
    } catch {
      /* invalid */
    }
  }, [categories, onCategoriesChange, selectedList]);

  const handleMoveToRoot = useCallback(() => {
    if (selectedList.length === 0) return;
    onCategoriesChange(moveTokensToRoot(categories, selectedList));
    setSelected(new Set());
    setCtxMenu(null);
  }, [categories, onCategoriesChange, selectedList]);

  const handleDeleteCategory = useCallback((categoryId: string) => {
    try {
      onCategoriesChange(deleteCategoryIfEmpty(categories, categoryId));
    } catch {
      /* not empty */
    }
  }, [categories, onCategoriesChange]);

  const openTokenContextMenu = useCallback((e: React.MouseEvent, tokenText: string) => {
    e.preventDefault();
    const texts = selected.has(tokenText) ? selectedList : [tokenText];
    setCtxNewCategoryName('');
    setCtxMenu({ x: e.clientX, y: e.clientY, tokenTexts: texts });
    if (!selected.has(tokenText)) {
      setSelected(new Set([tokenText]));
    }
  }, [selected, selectedList]);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = (ev: PointerEvent) => {
      if (menuRef.current?.contains(ev.target as Node)) return;
      setCtxMenu(null);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [ctxMenu]);

  const handleCtxCreateCategory = useCallback(() => {
    const name = ctxNewCategoryName.trim();
    if (!name || !ctxMenu) return;
    try {
      onCategoriesChange(createCategoryWithTokens(categories, name, ctxMenu.tokenTexts));
      setCtxMenu(null);
      setSelected(new Set());
    } catch {
      /* invalid */
    }
  }, [categories, ctxMenu, ctxNewCategoryName, onCategoriesChange]);

  const allCount = canonicalCount;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-shrink-0 p-2 border-b border-[#1a3a2a] bg-[#0a1510] space-y-2">
        <div className="flex flex-wrap items-center gap-1">
          <div className="flex flex-1 min-w-[8rem] items-center gap-1">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateCategory()}
              placeholder="Nuova categoria…"
              className="flex-1 min-w-0 bg-[#080e0a] border border-[#1a3a2a] rounded px-2 py-1 font-mono text-[10px] text-emerald-200 focus:outline-none focus:border-sky-400/40"
            />
            <button
              type="button"
              onClick={handleCreateCategory}
              disabled={!newCategoryName.trim()}
              title={selectedList.length > 0
                ? `Crea categoria e sposta ${selectedList.length} token`
                : 'Crea categoria vuota'}
              className="flex items-center gap-1 px-2 py-1 font-mono text-[9px] rounded border border-sky-400/30 text-sky-300/90 hover:bg-sky-400/10 disabled:opacity-40"
            >
              <FolderPlus className="w-3 h-3" />
              Crea
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {sortedCategories.length > 0 && (
            <select
              disabled={selectedList.length === 0}
              defaultValue=""
              onChange={(e) => {
                const id = e.target.value;
                if (id) handleMoveToCategory(id);
                e.target.value = '';
              }}
              className="flex-1 min-w-0 max-w-[9rem] bg-[#080e0a] border border-[#1a3a2a] rounded px-1.5 py-1 font-mono text-[9px] text-emerald-200 disabled:opacity-40"
              title="Sposta token selezionati in categoria"
            >
              <option value="">Sposta in…</option>
              {sortedCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          )}
          <button
            type="button"
            disabled={selectedList.length === 0}
            onClick={handleMoveToRoot}
            className="flex items-center gap-1 px-2 py-1 font-mono text-[9px] rounded border border-[#1a3a2a] text-emerald-400/70 hover:border-emerald-400/30 disabled:opacity-40"
          >
            <ArrowUpToLine className="w-3 h-3" />
            Radice
          </button>
          {selectedList.length > 0 && (
            <span className="font-mono text-[9px] text-sky-400/60 self-center px-1">
              {selectedList.length} selezionati
            </span>
          )}
        </div>
      </div>

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
        ) : (
          <span className="text-sky-400/50">
            Dizionario ({allCount}) · {sortedCategories.length} categorie
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-1.5 space-y-0.5">
        {allCount === 0 && aliasEntries.length === 0 ? (
          <p className="font-mono text-[10px] text-emerald-400/25 px-2 py-4 text-center leading-relaxed">
            Nessun token. Doppio click sul testo per creare un token.
          </p>
        ) : (
          <>
            {sortedCategories.map((cat, catIndex) => {
              const isCollapsed = collapsed.has(cat.id);
              return (
                <div key={cat.id} className="rounded border border-[#1a3a2a]/80 overflow-hidden mb-1">
                  <div className="flex items-center gap-0.5 px-1.5 py-1 bg-[#0c1410] group/cat">
                    <button
                      type="button"
                      onClick={() => toggleCollapsed(cat.id)}
                      className="p-0.5 text-emerald-400/40 hover:text-emerald-400/70"
                    >
                      {isCollapsed
                        ? <ChevronRight className="w-3 h-3" />
                        : <ChevronDown className="w-3 h-3" />}
                    </button>
                    <Folder className="w-3 h-3 text-amber-400/70 flex-shrink-0" />
                    <span className="flex-1 min-w-0 font-mono text-[10px] font-semibold text-amber-200/90 truncate" title={cat.name}>
                      {cat.name}
                    </span>
                    <span className="font-mono text-[8px] text-emerald-400/30 tabular-nums">
                      {cat.tokenTexts.length}
                    </span>
                    <div className="flex items-center opacity-0 group-hover/cat:opacity-100 transition-opacity">
                      <button
                        type="button"
                        disabled={catIndex === 0}
                        onClick={() => onCategoriesChange(reorderCategory(categories, cat.id, 'up'))}
                        className="p-0.5 text-emerald-400/40 hover:text-emerald-300 disabled:opacity-20"
                        title="Sposta su"
                      >
                        <ChevronUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        disabled={catIndex === sortedCategories.length - 1}
                        onClick={() => onCategoriesChange(reorderCategory(categories, cat.id, 'down'))}
                        className="p-0.5 text-emerald-400/40 hover:text-emerald-300 disabled:opacity-20"
                        title="Sposta giù"
                      >
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        disabled={cat.tokenTexts.length > 0}
                        onClick={() => handleDeleteCategory(cat.id)}
                        className="p-0.5 text-red-400/50 hover:text-red-300 disabled:opacity-20"
                        title={cat.tokenTexts.length > 0 ? 'Svuota la categoria prima' : 'Elimina categoria'}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  {!isCollapsed && (
                    <div className="pl-4 pr-1 py-0.5">
                      {cat.tokenTexts.length === 0 ? (
                        <p className="font-mono text-[9px] text-emerald-400/25 py-2 px-1 italic">vuota</p>
                      ) : (
                        cat.tokenTexts.map((text) => {
                          const entry = entryByText.get(text);
                          if (!entry) return null;
                          return (
                            <TokenRow
                              key={text}
                              entry={entry}
                              selected={selected.has(text)}
                              aliasPickActive={aliasPickActive}
                              onToggleSelect={() => toggleSelect(text)}
                              onRemove={() => onRemoveCanonical(text)}
                              onContextMenu={(e) => openTokenContextMenu(e, text)}
                              onPickAsAliasTarget={
                                aliasPickActive && onAliasTargetPick
                                  ? () => onAliasTargetPick(text)
                                  : undefined
                              }
                            />
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {rootTexts.length > 0 && (
              <div className="mt-2 pt-2 border-t border-[#1a3a2a]/60">
                <p className="font-mono text-[9px] uppercase tracking-wider text-emerald-400/35 px-2 mb-1">
                  Radice
                </p>
                {rootTexts.map((text) => {
                  const entry = entryByText.get(text);
                  if (!entry) return null;
                  return (
                    <TokenRow
                      key={text}
                      entry={entry}
                      selected={selected.has(text)}
                      aliasPickActive={aliasPickActive}
                      onToggleSelect={() => toggleSelect(text)}
                      onRemove={() => onRemoveCanonical(text)}
                      onContextMenu={(e) => openTokenContextMenu(e, text)}
                      onPickAsAliasTarget={
                        aliasPickActive && onAliasTargetPick
                          ? () => onAliasTargetPick(text)
                          : undefined
                      }
                    />
                  );
                })}
              </div>
            )}

            {aliasEntries.length > 0 && (
              <div className="mt-2 pt-2 border-t border-[#1a3a2a]/60">
                <p className="font-mono text-[9px] uppercase tracking-wider text-sky-400/45 px-2 mb-1">
                  Alias ({aliasEntries.length})
                </p>
                {aliasEntries.map((entry) => (
                  <div
                    key={entry.text}
                    className="group flex items-center gap-1.5 px-2 py-1 rounded hover:bg-[#0f1a12] transition-colors"
                    title={`alias of: ${entry.aliasOf}`}
                  >
                    <Circle className="w-2 h-2 flex-shrink-0 text-sky-400/60 fill-sky-400/25" />
                    <span className="flex-1 min-w-0 font-mono text-[10px] text-sky-200/90 truncate">
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
            )}
          </>
        )}
      </div>

      {ctxMenu && (
        <div
          ref={menuRef}
          className="fixed z-[200] min-w-[200px] py-2 px-2 rounded border border-amber-400/30 bg-[#0a1510] shadow-2xl font-mono text-[10px]"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          <p className="text-emerald-400/50 px-1 mb-2 uppercase tracking-wider text-[9px]">
            {ctxMenu.tokenTexts.length} token
          </p>
          <div className="flex gap-1 mb-2">
            <input
              type="text"
              value={ctxNewCategoryName}
              onChange={(e) => setCtxNewCategoryName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCtxCreateCategory()}
              placeholder="Nuova categoria"
              className="flex-1 bg-[#080e0a] border border-[#1a3a2a] rounded px-2 py-1 text-emerald-200 focus:outline-none focus:border-sky-400/40"
            />
            <button
              type="button"
              onClick={handleCtxCreateCategory}
              disabled={!ctxNewCategoryName.trim()}
              className="px-2 py-1 rounded bg-sky-400/20 text-sky-300 border border-sky-400/30 disabled:opacity-40"
            >
              Crea
            </button>
          </div>
          {sortedCategories.length > 0 && (
            <div className="border-t border-[#1a3a2a] pt-1 mt-1 max-h-40 overflow-y-auto">
              <p className="text-emerald-400/40 px-1 py-0.5 text-[9px]">Sposta in:</p>
              {sortedCategories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleMoveToCategory(cat.id)}
                  className="w-full text-left px-2 py-1 rounded hover:bg-[#0f1a12] text-amber-200/80 truncate"
                >
                  📂 {cat.name}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={handleMoveToRoot}
            className="w-full text-left px-2 py-1.5 mt-1 rounded hover:bg-[#0f1a12] text-emerald-400/70 border-t border-[#1a3a2a]"
          >
            Sposta alla radice
          </button>
        </div>
      )}
    </div>
  );
}
