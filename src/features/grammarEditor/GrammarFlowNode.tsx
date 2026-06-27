/**
 * Custom React Flow node for grammar graph editing.
 */
import { memo, useEffect, useRef, useState } from 'react';
import { Handle, NodeToolbar, Position, type NodeProps } from 'reactflow';
import { Box, Pencil } from 'lucide-react';
import type { GrammarGraphNode } from '../../lib/grammarGraph/grammarGraphTypes';
import { grammarNodeDisplayLabel, nodeWordsForEditor } from '../../lib/grammarGraph/grammarGraphDomain';
import { useGrammarEditorStore, useGrammarEditorStoreApi } from './grammarStoreContext';
import { GrammarNodeToolbar } from './GrammarNodeToolbar';
import { NodeWordsEditor } from './NodeWordsEditor';

export interface GrammarFlowNodeData {
  grammarNode: GrammarGraphNode;
}

function bindingStyles(node: GrammarGraphNode): { bg: string; Icon: typeof Box | typeof Pencil | null } {
  if (node.bindings.some((b) => b.type === 'semantic-set')) {
    return { bg: 'rgba(251, 191, 36, 0.35)', Icon: Box };
  }
  if (node.bindings.some((b) => b.type === 'semantic-value')) {
    return { bg: 'rgba(251, 146, 60, 0.35)', Icon: Pencil };
  }
  return { bg: 'rgba(16, 185, 129, 0.15)', Icon: null };
}

export const GrammarFlowNode = memo(function GrammarFlowNode({ id, data, selected }: NodeProps<GrammarFlowNodeData>) {
  const grammar = useGrammarEditorStore((s) => s.grammar);
  const selectedNodeId = useGrammarEditorStore((s) => s.selectedNodeId);
  const editingNodeId = useGrammarEditorStore((s) => s.editingNodeId);
  const store = useGrammarEditorStoreApi();
  const node = data.grammarNode;
  const [editLabel, setEditLabel] = useState(node.label);
  const [showWordsEditor, setShowWordsEditor] = useState(false);
  const [hovered, setHovered] = useState(false);
  const hideToolbarTimer = useRef<ReturnType<typeof setTimeout>>();
  const isEditing = editingNodeId === id;
  const isActive = selectedNodeId === id || selected;
  const showToolbar = !isEditing && (hovered || showWordsEditor);

  const revealToolbar = () => {
    clearTimeout(hideToolbarTimer.current);
    setHovered(true);
  };

  const scheduleHideToolbar = () => {
    clearTimeout(hideToolbarTimer.current);
    hideToolbarTimer.current = setTimeout(() => {
      setHovered(false);
    }, 180);
  };

  const caption = grammarNodeDisplayLabel(grammar, node);
  const { bg, Icon } = bindingStyles(node);
  const wordCount = nodeWordsForEditor(grammar, node).length;
  const labelInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingNodeId !== id) return;
    setEditLabel(node.label);
    requestAnimationFrame(() => labelInputRef.current?.focus());
  }, [editingNodeId, id, node.label]);

  return (
    <div
      data-id={id}
      className={`group grammar-flow-node relative rounded-lg border px-3 py-2 min-w-[140px] max-w-[260px] font-mono text-xs text-emerald-100 shadow-lg ${isActive ? 'border-sky-400' : 'border-emerald-500/30'} ${isEditing ? 'pointer-events-auto' : ''}`}
      style={{ background: bg }}
      onMouseEnter={revealToolbar}
      onMouseLeave={() => {
        if (showWordsEditor) return;
        scheduleHideToolbar();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        store.getState().setEditingNodeId(id);
        store.getState().setSelectedNodeId(id);
        setEditLabel(node.label);
      }}
    >
      <NodeToolbar isVisible={showToolbar} position={Position.Top} align="start">
        <GrammarNodeToolbar
          node={node}
          showWordsEditor={showWordsEditor}
          onMouseEnter={revealToolbar}
          onMouseLeave={() => {
            if (showWordsEditor) return;
            scheduleHideToolbar();
          }}
          onDelete={() => store.getState().deleteNode(id)}
          onToggleWords={() => setShowWordsEditor((v) => !v)}
          onToggleOptional={() => {
            store.getState().updateNode({
              ...node,
              optional: !node.optional,
              updatedAt: Date.now(),
            });
          }}
          onClearSemantics={() => {
            store.getState().clearSemantics(id);
            setShowWordsEditor(false);
          }}
        />
      </NodeToolbar>

      <NodeToolbar isVisible={showWordsEditor} position={Position.Bottom} align="start" offset={8}>
        <NodeWordsEditor
          graph={grammar}
          nodeId={id}
          onSave={(words) => store.getState().setNodeWords(id, words)}
          onClose={() => {
            setShowWordsEditor(false);
            scheduleHideToolbar();
          }}
        />
      </NodeToolbar>

      <Handle type="target" position={Position.Left} className="!bg-sky-400 !w-2.5 !h-2.5" />
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!bg-sky-400 !w-2.5 !h-2.5"
      />

      <div className="flex items-start gap-1.5">
        {Icon ? <Icon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-200" /> : null}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              ref={labelInputRef}
              className="w-full bg-[#0a1510] border border-sky-400/40 rounded px-1 py-0.5 text-emerald-100 nodrag nowheel"
              value={editLabel}
              placeholder="etichetta…"
              data-editing="true"
              onChange={(e) => setEditLabel(e.target.value)}
              onBlur={(e) => {
                if (e.relatedTarget === null && document.activeElement === document.body) return;
                store.getState().updateNode({
                  ...node,
                  label: editLabel.trim(),
                  updatedAt: Date.now(),
                });
                store.getState().setEditingNodeId(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') store.getState().setEditingNodeId(null);
              }}
              onPointerDown={(e) => e.stopPropagation()}
            />
          ) : (
            <div className="truncate font-medium">{caption}</div>
          )}
          {wordCount > 1 ? (
            <div className="text-[10px] text-emerald-300/70 truncate">+{wordCount - 1} varianti</div>
          ) : null}
          {node.optional ? <div className="text-[10px] text-sky-300/80">opt</div> : null}
        </div>
      </div>
    </div>
  );
});
