/**
 * Inline synonym/word list editor for a grammar node (toolbar popover).
 */
import { useEffect, useState } from 'react';
import { wordsEditorForSelectedNode } from './SemanticPanel';
import type { GrammarGraph } from '../../lib/grammarGraph/grammarGraphTypes';

const PANEL_BG = '#121621';
const FIELD_BG = '#0a1510';

export function NodeWordsEditor({
  graph,
  nodeId,
  onSave,
  onClose,
}: {
  graph: GrammarGraph;
  nodeId: string;
  onSave: (words: string[]) => void;
  onClose: () => void;
}) {
  const initial = wordsEditorForSelectedNode(graph, nodeId);
  const [text, setText] = useState(initial.join('\n'));

  useEffect(() => {
    setText(wordsEditorForSelectedNode(graph, nodeId).join('\n'));
  }, [graph, nodeId]);

  const persist = () => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    onSave(lines);
    onClose();
  };

  return (
    <div
      className="nodrag nowheel w-56 rounded border border-emerald-500/40 p-2 shadow-2xl"
      style={{ backgroundColor: PANEL_BG }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="font-mono text-[10px] uppercase text-emerald-400/80 mb-1">Parole / sinonimi</div>
      <textarea
        className="nodrag nowheel w-full h-24 font-mono text-xs border border-emerald-500/30 rounded p-2 text-emerald-100 resize-none"
        style={{ backgroundColor: FIELD_BG, color: '#d1fae5' }}
        value={text}
        autoFocus
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) persist();
        }}
      />
      <div className="flex justify-end gap-2 mt-1">
        <button type="button" className="nodrag text-[10px] font-mono text-emerald-300/70" onClick={onClose}>
          Annulla
        </button>
        <button type="button" className="nodrag text-[10px] font-mono text-sky-300" onClick={persist}>
          Salva
        </button>
      </div>
    </div>
  );
}
