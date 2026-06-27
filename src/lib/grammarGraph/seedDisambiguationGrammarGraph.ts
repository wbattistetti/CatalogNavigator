/**
 * Seeds a disambiguation answer grammar graph from plan options and optional saved grammar.
 */
import type { GrammarEntry } from '../analysisTypes';
import { extractSynonymsForTarget, sortSynonymsAlphabetically } from '../grammarSynonyms';
import { isNoneOption, compileTurnAnswerGrammar } from '../turnAnswerGrammar';
import type { GrammarGraph, GrammarGraphEdge, GrammarGraphNode, SemanticSet, SemanticValue } from './grammarGraphTypes';
import { generateGrammarId } from './grammarGraphId';
import { normalizeSeedGraph, verticalSeedPosition } from './grammarGraphLayout';

function seedSynonymsForOption(option: string, allOptions: string[], grammar: GrammarEntry | null | undefined): string[] {
  if (grammar?.regex?.trim()) {
    const fromGrammar = extractSynonymsForTarget(grammar, option);
    if (fromGrammar.length > 0) return sortSynonymsAlphabetically(fromGrammar);
  }
  const compiled = compileTurnAnswerGrammar(allOptions);
  if (compiled?.regex?.trim()) {
    const fromCompiled = extractSynonymsForTarget(compiled, option);
    if (fromCompiled.length > 0) return fromCompiled;
  }
  return [option];
}

function buildValueNodes(
  options: string[],
  grammar: GrammarEntry | null | undefined,
  setId: string,
  values: SemanticValue[],
): { nodes: GrammarGraphNode[]; edges: GrammarGraphEdge[] } {
  const nodes: GrammarGraphNode[] = [];
  const edges: GrammarGraphEdge[] = [];
  const now = Date.now();

  options.forEach((option, index) => {
    const value = values.find((v) => v.value === option);
    if (!value) return;
    const synonyms = seedSynonymsForOption(option, options, grammar).filter((s) => s !== option);
    const nodeId = `node-${value.id}`;
    nodes.push({
      id: nodeId,
      label: isNoneOption(option) ? 'none' : option,
      synonyms,
      bindings: [{ type: 'semantic-value', valueId: value.id }],
      optional: false,
      repeatable: false,
      position: verticalSeedPosition(index),
      createdAt: now,
      updatedAt: now,
    });
  });

  return { nodes, edges };
}

/** Builds or refreshes semantic set values from disambiguation options. */
export function buildSemanticSetFromOptions(
  options: string[],
  grammar: GrammarEntry | null | undefined,
  categoryName: string,
  existingSet?: SemanticSet,
): SemanticSet {
  const setId = existingSet?.id ?? generateGrammarId();
  const values: SemanticValue[] = options.map((option) => {
    const existing = existingSet?.values.find((v) => v.value === option);
    const synonyms = seedSynonymsForOption(option, options, grammar).filter((s) => s !== option);
    return {
      id: existing?.id ?? generateGrammarId(),
      value: option,
      synonyms: existing?.synonyms?.length ? existing.synonyms : synonyms,
    };
  });
  return {
    id: setId,
    name: categoryName || 'disambiguation_options',
    values,
  };
}

/** Creates a new grammar graph for a disambiguation message. */
export function seedDisambiguationGrammarGraph(
  options: string[],
  categoryName: string,
  grammar: GrammarEntry | null | undefined,
  existing?: GrammarGraph | null,
): GrammarGraph {
  const cleaned = options.map((o) => o.trim()).filter(Boolean);
  const now = Date.now();
  const semanticSet = buildSemanticSetFromOptions(
    cleaned,
    grammar,
    categoryName,
    existing?.semanticSets[0],
  );
  const { nodes, edges } = buildValueNodes(cleaned, grammar, semanticSet.id, semanticSet.values);

  if (existing?.nodes?.length) {
    return normalizeSeedGraph({
      ...existing,
      semanticSets: [semanticSet],
      metadata: existing.metadata ?? {
        createdAt: now,
        updatedAt: now,
        version: '1.0.0',
      },
    });
  }

  return {
    id: existing?.id ?? generateGrammarId(),
    name: categoryName || 'disambiguation',
    nodes,
    edges,
    semanticSets: [semanticSet],
    slots: [],
    metadata: {
      createdAt: now,
      updatedAt: now,
      version: '1.0.0',
    },
  };
}
