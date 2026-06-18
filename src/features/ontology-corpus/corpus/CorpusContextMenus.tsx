/**
 * Portaled context menus and drag ghost for corpus token editing.
 */
import { createPortal } from 'react-dom';
import type { TokenEntry } from '../../../lib/tokenDictionary';
import type {
  CorpusContextMenuState,
  LongerTokenPromptState,
} from '../useCorpusTokenMenus';

export function CorpusContextMenus({
  menu,
  menuRef,
  longerTokenPrompt,
  longerPromptRef,
  dragGhostRef,
  menuPhrase,
  menuIsCanonical,
  menuAliasEntry,
  canCreateToken,
  canStartAliasPick,
  onCreateToken,
  onStartAliasPick,
  onRemoveCanonical,
  onRemoveAlias,
  onDismissLongerPrompt,
  onConfirmShorterToken,
}: {
  menu: CorpusContextMenuState | null;
  menuRef: React.RefObject<HTMLDivElement | null>;
  longerTokenPrompt: LongerTokenPromptState | null;
  longerPromptRef: React.RefObject<HTMLDivElement | null>;
  dragGhostRef: React.RefObject<HTMLDivElement | null>;
  menuPhrase: string | null;
  menuIsCanonical: boolean;
  menuAliasEntry?: TokenEntry;
  canCreateToken: boolean;
  canStartAliasPick: boolean;
  onCreateToken: () => void;
  onStartAliasPick: () => void;
  onRemoveCanonical: (text: string) => void;
  onRemoveAlias: (text: string) => void;
  onDismissLongerPrompt: () => void;
  onConfirmShorterToken: () => void;
}) {
  return (
    <>
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
              onClick={onCreateToken}
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
              onClick={onStartAliasPick}
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
          {menuIsCanonical && menuPhrase && (
            <button
              type="button"
              onClick={() => {
                onRemoveCanonical(menuPhrase);
              }}
              className="w-full text-left px-3 py-1.5 font-mono text-xs text-red-300/80 hover:bg-red-400/10 transition-colors border-t border-[#1a3a2a]"
            >
              Rimuovi token
            </button>
          )}
          {menuAliasEntry && menuPhrase && (
            <button
              type="button"
              onClick={() => {
                onRemoveAlias(menuPhrase);
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
              onClick={onDismissLongerPrompt}
              className="px-3 py-1 rounded font-mono text-[11px] text-emerald-200/90 border border-[#1a3a2a] hover:bg-emerald-400/10 transition-colors"
            >
              Sì
            </button>
            <button
              type="button"
              onClick={onConfirmShorterToken}
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
    </>
  );
}
