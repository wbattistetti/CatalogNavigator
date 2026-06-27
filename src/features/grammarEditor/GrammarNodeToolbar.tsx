/**
 * Hover toolbar on grammar nodes: delete, words, optional, clear semantics.
 */
import { Eraser, List, Trash2 } from 'lucide-react';
import type { GrammarGraphNode } from '../../lib/grammarGraph/grammarGraphTypes';

export function GrammarNodeToolbar({
  node,
  showWordsEditor,
  onMouseEnter,
  onMouseLeave,
  onDelete,
  onToggleWords,
  onToggleOptional,
  onClearSemantics,
}: {
  node: GrammarGraphNode;
  showWordsEditor: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onDelete: () => void;
  onToggleWords: () => void;
  onToggleOptional: () => void;
  onClearSemantics: () => void;
}) {
  const hasSemantics = node.bindings.length > 0;

  return (
    <div
      className="nodrag flex items-center gap-1 rounded border border-emerald-500/25 bg-[#121621] px-1 py-0.5 shadow-lg"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <ToolbarButton title="Elimina nodo" onClick={onDelete} danger>
        <Trash2 className="w-3 h-3" />
      </ToolbarButton>
      <ToolbarButton title="Parole / sinonimi" onClick={onToggleWords} active={showWordsEditor}>
        <List className="w-3 h-3" />
      </ToolbarButton>
      <ToolbarButton
        title={node.optional ? 'Rendi obbligatorio' : 'Rendi opzionale'}
        onClick={onToggleOptional}
        active={node.optional}
      >
        <span className="text-[10px] font-mono">opt</span>
      </ToolbarButton>
      {hasSemantics ? (
        <ToolbarButton title="Clear semantica" onClick={onClearSemantics}>
          <Eraser className="w-3 h-3" />
        </ToolbarButton>
      ) : null}
    </div>
  );
}

function ToolbarButton({
  title,
  onClick,
  children,
  danger = false,
  active = false,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      className={`nodrag p-1 rounded font-mono ${
        danger
          ? 'text-red-300/90 hover:bg-red-900/40'
          : active
            ? 'text-sky-300 bg-sky-900/30'
            : 'text-emerald-200/90 hover:bg-emerald-900/40'
      }`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}
