/**
 * Visual grammar graph editor shell (React Flow canvas + semantic panel).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { GrammarGraph } from '../../lib/grammarGraph/grammarGraphTypes';
import { createEmptyNode, createSequentialEdge, optionTokenForNode, selectNodeForOption } from '../../lib/grammarGraph/grammarGraphDomain';
import { nodePositionFromCenter } from '../../lib/grammarGraph/grammarGraphLayout';
import { GrammarFlowNode } from './GrammarFlowNode';
import { GrammarEditorStoreProvider, useGrammarEditorStore, useGrammarEditorStoreApi } from './grammarStoreContext';
import { parseSemanticDragPayload, SemanticPanel } from './SemanticPanel';
import { useGrammarFlowAdapter } from './useGrammarFlowAdapter';

const nodeTypes = { grammar: GrammarFlowNode };

const PANEL_WIDTH_KEY = 'grammar-editor-semantic-width';
const DEFAULT_PANEL_WIDTH = 260;

function readPanelWidth(): number {
  try {
    const raw = localStorage.getItem(PANEL_WIDTH_KEY);
    const n = raw ? Number(raw) : DEFAULT_PANEL_WIDTH;
    return Number.isFinite(n) ? Math.min(480, Math.max(180, n)) : DEFAULT_PANEL_WIDTH;
  } catch {
    return DEFAULT_PANEL_WIDTH;
  }
}

function GrammarGraphCanvas({
  focusOptionToken,
  onGrammarChange,
  onSelectedOptionTokenChange,
}: {
  focusOptionToken?: string | null;
  onGrammarChange: (grammar: GrammarGraph) => void;
  onSelectedOptionTokenChange?: (optionToken: string | null) => void;
}) {
  const grammar = useGrammarEditorStore((s) => s.grammar);
  const selectedNodeId = useGrammarEditorStore((s) => s.selectedNodeId);
  const editingNodeId = useGrammarEditorStore((s) => s.editingNodeId);
  const store = useGrammarEditorStoreApi();
  const { screenToFlowPosition, fitView } = useReactFlow();
  const { nodes: initialNodes, edges: initialEdges } = useGrammarFlowAdapter(grammar);
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [panelWidth, setPanelWidth] = useState(readPanelWidth);
  const [resizing, setResizing] = useState(false);
  const lastGrammarRef = useRef(grammar);
  const initialFitDoneRef = useRef(false);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges]);

  useEffect(() => {
    if (lastGrammarRef.current === grammar) return;
    lastGrammarRef.current = grammar;
    onGrammarChange(grammar);
  }, [grammar, onGrammarChange]);

  useEffect(() => {
    if (!focusOptionToken) return;
    const node = selectNodeForOption(grammar, focusOptionToken);
    if (node) store.getState().setSelectedNodeId(node.id);
  }, [focusOptionToken, grammar, store]);

  useEffect(() => {
    onSelectedOptionTokenChange?.(optionTokenForNode(grammar, selectedNodeId));
  }, [grammar, selectedNodeId, onSelectedOptionTokenChange]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
    for (const change of changes) {
      if (change.type === 'remove') {
        store.getState().deleteEdge(change.id);
      }
    }
  }, [store]);

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    if (connection.source === connection.target) return;
    const exists = grammar.edges.some(
      (e) => e.source === connection.source && e.target === connection.target,
    );
    if (exists) return;
    store.getState().addEdge(createSequentialEdge(connection.source, connection.target));
  }, [grammar.edges, store]);

  const onNodeDragStop = useCallback((_: React.MouseEvent, node: Node) => {
    store.getState().updateNodePosition(node.id, node.position);
  }, [store]);

  const onPaneDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (editingNodeId) return;
    const center = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const node = createEmptyNode(nodePositionFromCenter(center));
    store.getState().addNode(node);
    store.getState().setSelectedNodeId(node.id);
    store.getState().setEditingNodeId(node.id);
  }, [editingNodeId, screenToFlowPosition, store]);

  const onInit = useCallback(() => {
    if (initialFitDoneRef.current) return;
    initialFitDoneRef.current = true;
    requestAnimationFrame(() => {
      fitView({ padding: 0.2, duration: 0 });
    });
  }, [fitView]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/json');
    const payload = parseSemanticDragPayload(raw);
    if (!payload) return;

    const binding = payload.type === 'semantic-set'
      ? { type: 'semantic-set' as const, setId: payload.setId! }
      : payload.type === 'semantic-value'
        ? { type: 'semantic-value' as const, valueId: payload.valueId! }
        : null;
    if (!binding) return;

    const targetEl = (e.target as HTMLElement).closest('.grammar-flow-node');
    if (targetEl) {
      const nodeId = targetEl.getAttribute('data-id');
      if (nodeId) {
        store.getState().applyBinding(nodeId, binding);
        return;
      }
    }

    const node = createEmptyNode(nodePositionFromCenter(screenToFlowPosition({ x: e.clientX, y: e.clientY })));
    node.label = payload.type === 'semantic-value' ? payload.label : '';
    node.bindings = [binding];
    store.getState().addNode(node);
  }, [screenToFlowPosition, store]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const highlightValueId = useMemo(() => {
    if (!selectedNodeId) return null;
    const node = grammar.nodes.find((n) => n.id === selectedNodeId);
    return node?.bindings.find((b) => b.type === 'semantic-value')?.valueId ?? null;
  }, [grammar.nodes, selectedNodeId]);

  const onSashDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setResizing(true);
    const startX = e.clientX;
    const startW = panelWidth;
    let latest = startW;
    const onMove = (ev: PointerEvent) => {
      latest = Math.min(480, Math.max(180, startW - (ev.clientX - startX)));
      setPanelWidth(latest);
    };
    const onUp = () => {
      setResizing(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      try { localStorage.setItem(PANEL_WIDTH_KEY, String(latest)); } catch { /* ignore */ }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [panelWidth]);

  const blockCanvas = !!editingNodeId;

  return (
    <div className={`flex flex-1 min-h-0 min-w-0 ${resizing ? 'select-none' : ''}`}>
      <div className="flex flex-col flex-1 min-w-0 min-h-0 bg-[#1a1f2e] rounded border border-emerald-500/20 overflow-hidden">
        <div className="flex-1 min-h-0">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDragStop={onNodeDragStop}
            onInit={onInit}
            onPaneDoubleClick={onPaneDoubleClick}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={(_, node) => {
              if (blockCanvas) return;
              store.getState().setSelectedNodeId(node.id);
            }}
            onPaneClick={() => {
              if (blockCanvas) return;
              store.getState().setSelectedNodeId(null);
            }}
            nodesDraggable={!blockCanvas}
            nodesConnectable={!blockCanvas}
            elementsSelectable={!blockCanvas}
            nodesFocusable={false}
            edgesFocusable={false}
            disableKeyboardA11y
            deleteKeyCode={blockCanvas ? null : 'Delete'}
            noDragClassName="nodrag"
            noWheelClassName="nowheel"
            zoomOnDoubleClick={false}
            className="grammar-flow-canvas"
          >
            <Background color="#2a3348" gap={16} />
            <Controls className="!bg-[#121621] !border-emerald-500/20" />
          </ReactFlow>
        </div>
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        className="w-1 flex-shrink-0 cursor-col-resize bg-emerald-500/20 hover:bg-sky-400/40"
        onPointerDown={onSashDown}
      />
      <div style={{ width: panelWidth }} className="flex-shrink-0 min-h-0">
        <SemanticPanel
          highlightValueId={highlightValueId}
          onValueSelect={(_valueId, optionToken) => {
            const node = selectNodeForOption(grammar, optionToken);
            if (node) store.getState().setSelectedNodeId(node.id);
          }}
        />
      </div>
    </div>
  );
}

export function GrammarGraphEditor({
  grammarKey,
  initialGrammar,
  focusOptionToken,
  onGrammarChange,
  onSelectedOptionTokenChange,
}: {
  grammarKey: string;
  initialGrammar: GrammarGraph;
  focusOptionToken?: string | null;
  onGrammarChange: (grammar: GrammarGraph) => void;
  onSelectedOptionTokenChange?: (optionToken: string | null) => void;
}) {
  return (
    <GrammarEditorStoreProvider grammarKey={grammarKey} initialGrammar={initialGrammar}>
      <ReactFlowProvider>
        <GrammarGraphCanvas
          focusOptionToken={focusOptionToken}
          onGrammarChange={onGrammarChange}
          onSelectedOptionTokenChange={onSelectedOptionTokenChange}
        />
      </ReactFlowProvider>
    </GrammarEditorStoreProvider>
  );
}
