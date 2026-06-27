/**
 * Maps grammar graph nodes/edges to React Flow elements.
 */
import { useMemo } from 'react';
import type { Edge, Node } from 'reactflow';
import type { GrammarGraph } from '../../lib/grammarGraph/grammarGraphTypes';
import { grammarNodeDisplayLabel } from '../../lib/grammarGraph/grammarGraphDomain';

export function useGrammarFlowAdapter(grammar: GrammarGraph): { nodes: Node[]; edges: Edge[] } {
  return useMemo(() => {
    const nodes: Node[] = grammar.nodes.map((n) => ({
      id: n.id,
      type: 'grammar',
      position: n.position,
      data: { grammarNode: n },
      draggable: true,
      selectable: true,
    }));
    const edges: Edge[] = grammar.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      label: e.type,
      data: { edgeType: e.type },
    }));
    return { nodes, edges };
  }, [grammar]);
}

export function nodeCaption(graph: GrammarGraph, nodeId: string): string {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) return '';
  return grammarNodeDisplayLabel(graph, node);
}
