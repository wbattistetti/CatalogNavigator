/**
 * Compiled agent runtime bundle: ontology, segmented corpus, and constraint validators.
 */
import type { Analysis } from './analysisTypes';
import type { LoadedDictionaryRef } from './multiDictionarySegment';
import type { TokenDictionary } from './tokenDictionary';

export type AgentBundleMode = 'preview' | 'published';

export type ConstraintKind = 'age_years';

/** Compile-time age constraint derived from a vincolo token. */
export interface CompiledAgeConstraint {
  kind: 'age_years';
  categoryName: string;
  askKey: 'age_years';
  min: number | null;
  max: number | null;
  sourceToken: string;
}

export type CompiledConstraint = CompiledAgeConstraint;

export interface BundleCorpusSegment {
  text: string;
  categoryName: string;
  categoryType: 'attributo' | 'vincolo';
}

/** One corpus row materialized for backend runtime. */
export interface BundleCorpusItem {
  path: string;
  sourceText: string;
  segments: BundleCorpusSegment[];
  unmatched: string[];
  constraints: CompiledConstraint[];
}

export interface AgentBundleMeta {
  documentName: string;
  documentId: string | null;
  mode: AgentBundleMode;
  version: string;
  compiledAt: string;
  warnings: string[];
}

/** Snapshot consumed by preview deploy and published backend turns. */
export interface AgentBundle {
  meta: AgentBundleMeta;
  dictionary: TokenDictionary;
  /** Saved ontology tree + item_paths (legacy JSON key; VB engine reads this). */
  analysis: Analysis;
  /** Same saved ontology as `analysis`. */
  ontology: Analysis;
  corpusItems: BundleCorpusItem[];
  itemPaths: string[];
}

export interface AgentBundleCompileInput {
  documentName: string;
  documentId?: string | null;
  mode?: AgentBundleMode;
  dictionary: TokenDictionary;
  descriptions: string[];
  analysis: Analysis | null;
  /** Optional path → raw description map for corpus sourceText (not used for segmentation). */
  leafDescriptionMap?: ReadonlyMap<string, string> | Record<string, string>;
  /** Category layout for path token typing (multi-dictionary order when set). */
  loadedRefs?: LoadedDictionaryRef[];
  dictionaryDirty?: boolean;
  analysisDirty?: boolean;
  pathsOutOfSync?: boolean;
}

export type AgentTurnAction =
  | 'start'
  | 'ask_age'
  | 'disambiguate'
  | 'confirm_implicit'
  | 'confirm'
  | 'no_match'
  | 'already_done';

/** Kind of value ConvAI must send on the next tool call for one slot. */
export type ExpectedSlotValueKind = 'age_years' | 'canonical_token';

/** Per-turn contract: what the voice agent should put in incomingSlots next. */
export interface ExpectedSlotInput {
  categoryName: string;
  valueKind: ExpectedSlotValueKind;
  description: string;
}

export interface PendingSlotContract extends ExpectedSlotInput {
  /** Canonical tokens allowed when valueKind is canonical_token (disambiguate). */
  allowedTokens?: string[];
}

/** Structured next-step instruction for the voice layer (see debug.log for trace). */
export interface AgentTurnInstruction {
  action: AgentTurnAction;
  categoryName?: string;
  options?: string[];
  /** Single value inferred from candidates when confirmImplicitSlots is enabled. */
  implicitValue?: string;
  path?: string;
  /** What ConvAI must send in the next agent_dialog_step call. */
  expectedInput?: { slots: ExpectedSlotInput[] };
}

/** One slot filled by the voice agent (category label + canonical token). */
export interface AgentParsedSlot {
  categoryName: string;
  value: string;
}

/** Slots supplied by the voice agent for one turn. */
export interface AgentTurnInput {
  incomingSlots: AgentParsedSlot[];
  /** User transcript; also used to extract age when slots carry fascia labels instead of years. */
  transcript?: string;
  /**
   * When true, single-value categories among candidates require yes/no confirmation
   * before being written to resolvedSlots. Silent implicit inference is disabled.
   */
  confirmImplicitSlots?: boolean;
}

/** One concept acquired during the conversation. */
export interface AgentConcept {
  category: string;
  value: string;
  kind?: 'attributo' | 'vincolo';
  unit?: string;
}

export interface AgentSessionState {
  /** Concepts acquired during the conversation (VB sole source of truth). */
  acquiredConcepts: AgentConcept[];
  selectedPath: string | null;
  noMatchCount: number;
  lastTranscript?: string;
  pendingExpectedInput?: PendingSlotContract[] | null;
}

export function initAgentSession(): AgentSessionState {
  return { acquiredConcepts: [], selectedPath: null, noMatchCount: 0 };
}

export interface AgentTurnResult {
  instruction: AgentTurnInstruction;
  /** Concepts received this turn (echo for debug). */
  parsed: AgentParsedSlot[];
  spokenHint: string;
  candidateCount: number;
  candidatePaths?: string[];
  nextState: AgentSessionState;
}
