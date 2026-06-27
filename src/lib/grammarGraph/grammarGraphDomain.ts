/**
 * Pure domain helpers for grammar graph editing (no React).
 */
import type {
  GrammarGraph,
  GrammarGraphEdge,
  GrammarGraphNode,
  NodeBinding,
  SemanticSet,
  SemanticValue,
} from './grammarGraphTypes';
import { generateGrammarId } from './grammarGraphId';

export interface BindingValidationResult {
  ok: boolean;
  error?: string;
}

export function findSemanticValue(graph: GrammarGraph, valueId: string): SemanticValue | null {
  for (const set of graph.semanticSets) {
    const found = set.values.find((v) => v.id === valueId);
    if (found) return found;
  }
  return null;
}

export function findSemanticSet(graph: GrammarGraph, setId: string): SemanticSet | null {
  return graph.semanticSets.find((s) => s.id === setId) ?? null;
}

export function validateBindings(bindings: NodeBinding[]): BindingValidationResult {
  const slots = bindings.filter((b) => b.type === 'slot');
  const values = bindings.filter((b) => b.type === 'semantic-value');
  const sets = bindings.filter((b) => b.type === 'semantic-set');

  if (slots.length > 1) return { ok: false, error: 'Massimo 1 slot per nodo.' };
  if (values.length > 1) return { ok: false, error: 'Massimo 1 valore semantico per nodo.' };
  if (sets.length > 0 && values.length > 0) {
    return { ok: false, error: 'Non puoi mescolare semantic-set e semantic-value sullo stesso nodo.' };
  }
  return { ok: true };
}

export function addBinding(node: GrammarGraphNode, binding: NodeBinding): GrammarGraphNode {
  const nextBindings = [...node.bindings];
  if (binding.type === 'semantic-value') {
    const idx = nextBindings.findIndex((b) => b.type === 'semantic-value');
    if (idx >= 0) nextBindings[idx] = binding;
    else nextBindings.push(binding);
  } else if (binding.type === 'semantic-set') {
    const idx = nextBindings.findIndex((b) => b.type === 'semantic-set');
    if (idx >= 0) nextBindings[idx] = binding;
    else nextBindings.push(binding);
  } else {
    nextBindings.push(binding);
  }

  const validation = validateBindings(nextBindings);
  if (!validation.ok) throw new Error(validation.error ?? 'Binding non valido.');

  return {
    ...node,
    bindings: nextBindings,
    updatedAt: Date.now(),
  };
}

export function clearSemanticBindings(node: GrammarGraphNode): GrammarGraphNode {
  return {
    ...node,
    bindings: node.bindings.filter((b) => b.type === 'slot'),
    updatedAt: Date.now(),
  };
}

export function removeBinding(node: GrammarGraphNode, index: number): GrammarGraphNode {
  const next = node.bindings.filter((_, i) => i !== index);
  return { ...node, bindings: next, updatedAt: Date.now() };
}

export function grammarNodeDisplayLabel(graph: GrammarGraph, node: GrammarGraphNode): string {
  const valueBinding = node.bindings.find((b) => b.type === 'semantic-value');
  if (valueBinding?.valueId) {
    const value = findSemanticValue(graph, valueBinding.valueId);
    if (value) return value.value;
  }
  const setBinding = node.bindings.find((b) => b.type === 'semantic-set');
  if (setBinding?.setId && !node.label.trim()) {
    const set = findSemanticSet(graph, setBinding.setId);
    if (set) return set.name;
  }
  if (node.label.trim()) return node.label;
  if (node.synonyms.length > 0) return node.synonyms[0]!;
  return '…';
}

export function createEmptyNode(position: { x: number; y: number }): GrammarGraphNode {
  const now = Date.now();
  return {
    id: generateGrammarId(),
    label: '',
    synonyms: [],
    bindings: [],
    optional: false,
    repeatable: false,
    position,
    createdAt: now,
    updatedAt: now,
  };
}

export function createSequentialEdge(source: string, target: string): GrammarGraphEdge {
  return {
    id: generateGrammarId(),
    source,
    target,
    type: 'sequential',
  };
}

export function updateNodeInGraph(graph: GrammarGraph, node: GrammarGraphNode): GrammarGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) => (n.id === node.id ? node : n)),
    metadata: { ...graph.metadata, updatedAt: Date.now() },
  };
}

export function updateSemanticValueSynonyms(
  graph: GrammarGraph,
  valueId: string,
  synonyms: string[],
): GrammarGraph {
  return {
    ...graph,
    semanticSets: graph.semanticSets.map((set) => ({
      ...set,
      values: set.values.map((v) => (v.id === valueId ? { ...v, synonyms } : v)),
    })),
    metadata: { ...graph.metadata, updatedAt: Date.now() },
  };
}

export function nodeWordsForEditor(graph: GrammarGraph, node: GrammarGraphNode): string[] {
  const valueBinding = node.bindings.find((b) => b.type === 'semantic-value');
  const fromNode = [node.label, ...node.synonyms].map((s) => s.trim()).filter(Boolean);
  if (!valueBinding?.valueId) return fromNode;
  const value = findSemanticValue(graph, valueBinding.valueId);
  if (!value) return fromNode;
  const merged = new Set<string>(fromNode.map((s) => s.toLowerCase()));
  const out = [...fromNode];
  for (const s of [value.value, ...value.synonyms]) {
    const t = s.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (merged.has(key)) continue;
    merged.add(key);
    out.push(t);
  }
  return out;
}

export function applyWordsToNode(
  graph: GrammarGraph,
  nodeId: string,
  words: string[],
): GrammarGraph {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) return graph;
  const cleaned = words.map((w) => w.trim()).filter(Boolean);
  const valueBinding = node.bindings.find((b) => b.type === 'semantic-value');
  let nextGraph = graph;
  let nextNode: GrammarGraphNode = {
    ...node,
    label: cleaned[0] ?? '',
    synonyms: cleaned.slice(1),
    updatedAt: Date.now(),
  };
  if (valueBinding?.valueId) {
    const value = findSemanticValue(graph, valueBinding.valueId);
    if (value) {
      nextGraph = updateSemanticValueSynonyms(
        nextGraph,
        valueBinding.valueId,
        cleaned.slice(1).filter((s) => s.toLowerCase() !== (cleaned[0] ?? '').toLowerCase()),
      );
    }
  }
  return updateNodeInGraph(nextGraph, nextNode);
}

export function selectNodeForOption(graph: GrammarGraph, optionToken: string): GrammarGraphNode | null {
  const value = graph.semanticSets.flatMap((s) => s.values).find((v) => v.value === optionToken);
  if (!value) return null;
  return graph.nodes.find(
    (n) => n.bindings.some((b) => b.type === 'semantic-value' && b.valueId === value.id),
  ) ?? null;
}

export function optionTokenForNode(graph: GrammarGraph, nodeId: string | null | undefined): string | null {
  if (!nodeId) return null;
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  const binding = node.bindings.find((b) => b.type === 'semantic-value');
  if (!binding?.valueId) return null;
  return findSemanticValue(graph, binding.valueId)?.value ?? null;
}
