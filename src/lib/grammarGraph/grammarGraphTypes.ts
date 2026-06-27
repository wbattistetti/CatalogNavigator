/**
 * Design-time grammar graph contracts (aligned with VB GrammarGraphModels).
 */

export type GrammarEdgeType = 'sequential' | 'alternative' | 'optional';

export type NodeBindingType = 'slot' | 'semantic-set' | 'semantic-value';

export interface GrammarGraphPosition {
  x: number;
  y: number;
}

export interface NodeBinding {
  type: NodeBindingType;
  slotId?: string;
  setId?: string;
  valueId?: string;
}

export interface SemanticValue {
  id: string;
  value: string;
  synonyms: string[];
  regex?: string;
}

export interface SemanticSet {
  id: string;
  name: string;
  values: SemanticValue[];
}

export interface GrammarGraphNode {
  id: string;
  label: string;
  synonyms: string[];
  regex?: string;
  bindings: NodeBinding[];
  optional?: boolean;
  repeatable?: boolean;
  position: GrammarGraphPosition;
  createdAt?: number;
  updatedAt?: number;
}

export interface GrammarGraphEdge {
  id: string;
  source: string;
  target: string;
  type: GrammarEdgeType;
  label?: string;
}

export interface GrammarGraphMetadata {
  createdAt: number;
  updatedAt: number;
  version: string;
}

export interface GrammarGraph {
  id: string;
  name: string;
  nodes: GrammarGraphNode[];
  edges: GrammarGraphEdge[];
  semanticSets: SemanticSet[];
  slots?: [];
  metadata: GrammarGraphMetadata;
}

export interface AnswerGrammarMatchResponse {
  matchedOption: string | null;
  matchedOptions: string[];
  compileError: string | null;
}
