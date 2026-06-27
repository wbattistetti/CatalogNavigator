import { describe, expect, it } from 'vitest';
import { seedDisambiguationGrammarGraph } from './seedDisambiguationGrammarGraph';
import { verticalSeedPosition } from './grammarGraphLayout';

describe('seedDisambiguationGrammarGraph', () => {
  it('creates semantic set and value nodes for each option', () => {
    const graph = seedDisambiguationGrammarGraph(
      ['ecg', 'none'],
      'ECG',
      null,
    );
    expect(graph.semanticSets).toHaveLength(1);
    expect(graph.semanticSets[0]!.values).toHaveLength(2);
    expect(graph.nodes.length).toBeGreaterThanOrEqual(2);
    const valueNodes = graph.nodes.filter((n) =>
      n.bindings.some((b) => b.type === 'semantic-value'),
    );
    expect(valueNodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(0);
    expect(valueNodes[0]!.position).toEqual(verticalSeedPosition(0));
    expect(valueNodes[1]!.position).toEqual(verticalSeedPosition(1));
  });

  it('normalizes legacy horizontal layout and strips hub edges', () => {
    const existing = seedDisambiguationGrammarGraph(['a', 'b'], 'Cat', null);
    const horizontal = {
      ...existing,
      nodes: existing.nodes.map((n, i) => ({ ...n, position: { x: 120 + i * 220, y: 180 } })),
      edges: [{ id: 'e1', source: 'hub', target: existing.nodes[0]!.id, type: 'sequential' as const }],
    };
    const graph = seedDisambiguationGrammarGraph(['a', 'b'], 'Cat', null, horizontal);
    expect(graph.edges).toHaveLength(0);
    const valueNodes = graph.nodes.filter((n) =>
      n.bindings.some((b) => b.type === 'semantic-value'),
    );
    expect(valueNodes[0]!.position.x).toBe(80);
    expect(valueNodes[1]!.position.y).toBeGreaterThan(valueNodes[0]!.position.y);
  });
});
