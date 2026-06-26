/**
 * Types for the compile-time disambiguation plan (reachable conversation graph).
 */
import type { GrammarEntry } from './analysisTypes';

export type DisambiguationAction =
  | 'disambiguate'
  | 'ask_age'
  | 'confirm'
  | 'dead'
  | 'stuck';

export type DisambiguationQuestionStyle = 'choice' | 'optional_include' | 'ask_age';

/** Above this many real options, copy is grouped as open multi-choice. */
export const DISAMBIGUATION_MULTI_CHOICE_THRESHOLD = 4;
export const DISAMBIGUATION_MULTI_CHOICE_MARKER = '__multi__';

/** One decision point in the reachable dialog graph. */
export interface DisambiguationPlanNode {
  /** Unique runtime lookup: acquired state + category + full options. */
  key: string;
  /** Compact copy key for shared messages — NOT the full option list when many choices. */
  signature: string;
  acquired: Record<string, string>;
  ageYears: number | null;
  action: DisambiguationAction;
  categoryName?: string;
  /** Technical option tokens (may include "none"). */
  options?: string[];
  style?: DisambiguationQuestionStyle;
  candidateCount: number;
  candidatePathsSample: string[];
}

export interface DisambiguationPlanStats {
  catalogItemCount: number;
  /** Distinct candidate-set situations explored (acquired slots + surviving catalog paths). */
  totalStates: number;
  disambiguateNodes: number;
  /** Distinct states where runtime would ask patient age before continuing. */
  askAgeNodes: number;
  confirmStates: number;
  deadStates: number;
  stuckStates: number;
  /** Unique disambiguation copy by (category + options + style), excluding age. */
  uniqueDisambiguationBySignature: number;
  /** One disambiguation message per full lookup key (includes context). */
  uniqueDisambiguationByFullKey: number;
  /** Age question patterns (usually 0 or 1). */
  uniqueAgePatterns: number;
}

export interface DisambiguationPlanResult {
  nodes: DisambiguationPlanNode[];
  stats: DisambiguationPlanStats;
  computedAt: string;
  warnings: string[];
}

/** One design-time utterance used to validate answer grammar (not a synonym). */
export interface DisambiguationTestPhrase {
  phrase: string;
  /** Technical option token expected when the patient says phrase. */
  expected: string;
}

/** Editable copy for one disambiguation signature (reused across contexts). */
export interface DisambiguationMessageRecord {
  signature: string;
  categoryName: string;
  options: string[];
  style: DisambiguationQuestionStyle;
  question: string | null;
  no_match_1: string | null;
  no_match_2: string | null;
  no_match_3: string | null;
  source?: 'deterministic' | 'ai' | 'manual';
  status?: 'approved' | 'rejected' | 'uncertain' | null;
  /** How many plan nodes share this signature. */
  contextCount?: number;
  /** Maps utterance → canonical option token (includes "none" when applicable). */
  answer_grammar?: GrammarEntry | null;
  /** Saved test utterances for grammar validation in the editor. */
  test_phrases?: DisambiguationTestPhrase[];
}

/** Persisted with analysis — messages keyed by signature. */
export interface DisambiguationPlanStorage {
  computedAt: string | null;
  messages: DisambiguationMessageRecord[];
}
