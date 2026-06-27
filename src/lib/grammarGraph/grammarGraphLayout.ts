/**
 * Layout helpers for disambiguation grammar graph seeding and legacy cleanup.
 */
import type { GrammarGraph, GrammarGraphEdge, GrammarGraphNode } from './grammarGraphTypes';

const LEGACY_HUB_ID = 'node-alternative-hub';
const SEED_X = 80;
const SEED_Y_START = 80;
const SEED_ROW_HEIGHT = 88;

/** Approximate rendered size of a grammar flow node (top-left origin). */
export const GRAMMAR_FLOW_NODE_SIZE = { width: 140, height: 44 } as const;

/** Converts a canvas click point to node position so the node center sits on the point. */
export function nodePositionFromCenter(center: { x: number; y: number }): { x: number; y: number } {
  return {
    x: center.x - GRAMMAR_FLOW_NODE_SIZE.width / 2,
    y: center.y - GRAMMAR_FLOW_NODE_SIZE.height / 2,
  };
}

/** Removes legacy alternative-hub nodes and their edges from older seeds. */
export function stripLegacyHubFromGraph(graph: GrammarGraph): GrammarGraph {
  const hubIds = new Set(graph.nodes.filter((n) => n.id === LEGACY_HUB_ID).map((n) => n.id));
  if (hubIds.size === 0) return graph;

  const nodes = graph.nodes.filter((n) => !hubIds.has(n.id));
  const edges = graph.edges.filter((e) => !hubIds.has(e.source) && !hubIds.has(e.target));
  return { ...graph, nodes, edges };
}

/** Vertical left-aligned positions for seed nodes (one per semantic value). */
export function verticalSeedPosition(index: number): { x: number; y: number } {
  return { x: SEED_X, y: SEED_Y_START + index * SEED_ROW_HEIGHT };
}

/** Re-applies vertical seed layout when nodes have no meaningful custom placement. */
export function relayoutSeedNodesVertically(nodes: GrammarGraphNode[]): GrammarGraphNode[] {
  const valueNodes = nodes.filter((n) => n.bindings.some((b) => b.type === 'semantic-value'));
  if (valueNodes.length === 0) return nodes;

  const ordered = [...valueNodes].sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
  const positionById = new Map<string, { x: number; y: number }>();
  ordered.forEach((node, index) => {
    positionById.set(node.id, verticalSeedPosition(index));
  });

  return nodes.map((node) => ({
    ...node,
    position: positionById.get(node.id) ?? node.position,
  }));
}

export function isLikelyAutoHorizontalLayout(nodes: GrammarGraphNode[]): boolean {
  if (nodes.length < 2) return false;
  const ys = nodes.map((n) => Math.round(n.position.y));
  const uniqueY = new Set(ys);
  return uniqueY.size === 1;
}

export function normalizeSeedGraph(graph: GrammarGraph): GrammarGraph {
  let next = stripLegacyHubFromGraph(graph);
  if (isLikelyAutoHorizontalLayout(next.nodes)) {
    next = { ...next, nodes: relayoutSeedNodesVertically(next.nodes), edges: [] };
  }
  return next;
}

export function nextNodePositionBelow(nodes: GrammarGraphNode[]): { x: number; y: number } {
  if (nodes.length === 0) return verticalSeedPosition(0);
  const maxY = Math.max(...nodes.map((n) => n.position.y));
  return { x: SEED_X, y: maxY + SEED_ROW_HEIGHT };
}
