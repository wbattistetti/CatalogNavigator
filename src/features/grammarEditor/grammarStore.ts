/**
 * Zustand store for a single grammar graph editor instance.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { GrammarGraph, GrammarGraphEdge, GrammarGraphNode, NodeBinding } from '../../lib/grammarGraph/grammarGraphTypes';
import {
  addBinding,
  applyWordsToNode,
  clearSemanticBindings,
  removeBinding,
  updateNodeInGraph,
} from '../../lib/grammarGraph/grammarGraphDomain';

export interface GrammarEditorState {
  grammar: GrammarGraph;
  selectedNodeId: string | null;
  editingNodeId: string | null;
}

export interface GrammarEditorActions {
  loadGrammar: (grammar: GrammarGraph) => void;
  setSelectedNodeId: (id: string | null) => void;
  setEditingNodeId: (id: string | null) => void;
  updateNode: (node: GrammarGraphNode) => void;
  updateNodePosition: (id: string, position: { x: number; y: number }) => void;
  addNode: (node: GrammarGraphNode) => void;
  deleteNode: (id: string) => void;
  addEdge: (edge: GrammarGraphEdge) => void;
  deleteEdge: (id: string) => void;
  applyBinding: (nodeId: string, binding: NodeBinding) => void;
  clearSemantics: (nodeId: string) => void;
  removeBindingAt: (nodeId: string, index: number) => void;
  setNodeWords: (nodeId: string, words: string[]) => void;
}

export type GrammarEditorStore = GrammarEditorState & GrammarEditorActions;

export function createGrammarEditorStore(initialGrammar: GrammarGraph): StoreApi<GrammarEditorStore> {
  return createStore<GrammarEditorStore>((set, get) => ({
    grammar: initialGrammar,
    selectedNodeId: null,
    editingNodeId: null,

    loadGrammar: (grammar) => set({ grammar, selectedNodeId: null, editingNodeId: null }),

    setSelectedNodeId: (id) => set({ selectedNodeId: id }),

    setEditingNodeId: (id) => set({ editingNodeId: id }),

    updateNode: (node) => set((state) => ({
      grammar: updateNodeInGraph(state.grammar, node),
    })),

    updateNodePosition: (id, position) => {
      const node = get().grammar.nodes.find((n) => n.id === id);
      if (!node) return;
      get().updateNode({ ...node, position, updatedAt: Date.now() });
    },

    addNode: (node) => set((state) => ({
      grammar: {
        ...state.grammar,
        nodes: [...state.grammar.nodes, node],
        metadata: { ...state.grammar.metadata, updatedAt: Date.now() },
      },
      selectedNodeId: node.id,
    })),

    deleteNode: (id) => set((state) => ({
      grammar: {
        ...state.grammar,
        nodes: state.grammar.nodes.filter((n) => n.id !== id),
        edges: state.grammar.edges.filter((e) => e.source !== id && e.target !== id),
        metadata: { ...state.grammar.metadata, updatedAt: Date.now() },
      },
      selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
      editingNodeId: state.editingNodeId === id ? null : state.editingNodeId,
    })),

    addEdge: (edge) => set((state) => ({
      grammar: {
        ...state.grammar,
        edges: [...state.grammar.edges, edge],
        metadata: { ...state.grammar.metadata, updatedAt: Date.now() },
      },
    })),

    deleteEdge: (id) => set((state) => ({
      grammar: {
        ...state.grammar,
        edges: state.grammar.edges.filter((e) => e.id !== id),
        metadata: { ...state.grammar.metadata, updatedAt: Date.now() },
      },
    })),

    applyBinding: (nodeId, binding) => {
      const node = get().grammar.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      try {
        get().updateNode(addBinding(node, binding));
      } catch (e) {
        alert(e instanceof Error ? e.message : String(e));
      }
    },

    clearSemantics: (nodeId) => {
      const node = get().grammar.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      get().updateNode(clearSemanticBindings(node));
    },

    removeBindingAt: (nodeId, index) => {
      const node = get().grammar.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      get().updateNode(removeBinding(node, index));
    },

    setNodeWords: (nodeId, words) => set((state) => ({
      grammar: applyWordsToNode(state.grammar, nodeId, words),
    })),
  }));
}
