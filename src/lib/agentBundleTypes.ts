/**
 * Compiled agent runtime bundle: ontology, segmented corpus, and constraint validators.
 */
import type { Analysis } from './analysisTypes';
import type { LoadedDictionaryRef } from './multiDictionarySegment';
import type { TokenDictionary } from './tokenDictionary';

export type AgentBundleMode = 'preview' | 'published';

export type ConstraintKind = 'age_years';

/** Category semantic type: attributo (catalog dimension) or vincolo (eligibility rule). */
export type ConceptKind = 'attributo' | 'vincolo';

/** Compile-time age constraint derived from a vincolo token. */
export interface CompiledAgeConstraint {
  kind: 'age_years';
  categoryName: string;
  askKey: 'age_years';
  min: number | null;
  max: number | null;
  /** Inclusive lower bound in total months (legacy). */
  minMonths: number | null;
  /** Inclusive upper bound in total months (legacy). */
  maxMonths: number | null;
  /** Inclusive lower bound in total weeks (canonical runtime unit). */
  minWeeks: number | null;
  /** Inclusive upper bound in total weeks (canonical runtime unit). */
  maxWeeks: number | null;
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
  /** Spoken confirmation phrase (readable catalog); defaults to sourceText when unset. */
  confirmationText: string;
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
  catalogSanity?: CatalogSanityReport;
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

/** Manual segment removals keyed by trimmed corpus description (right-column edits). */
export type SegmentExclusionsByText = ReadonlyMap<string, ReadonlySet<string>>;

export interface AgentBundleCompileInput {
  documentName: string;
  documentId?: string | null;
  mode?: AgentBundleMode;
  dictionary: TokenDictionary;
  /** Corpus description lines used for live segmentation (in-memory, not saved item_paths). */
  /** In-memory corpus lines; catalog paths are segmented from these, not from analysis.item_paths. */
  descriptions: string[];
  analysis: Analysis | null;
  /** Optional path → raw description map for corpus sourceText (not used for segmentation). */
  leafDescriptionMap?: ReadonlyMap<string, string> | Record<string, string>;
  /** Category layout for path token typing (multi-dictionary order when set). */
  loadedRefs?: LoadedDictionaryRef[];
  /** Right-column manual segment removals applied before catalog compile. */
  segmentExclusions?: SegmentExclusionsByText;
  /** Whole corpus rows omitted from catalog compile. */
  itemExclusions?: ReadonlySet<string>;
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
  /** Reply anchor: disambiguation prompt the user utterance answers (restores lost session pending). */
  answerContext?: {
    categoryName: string;
    options: string[];
    signature?: string;
    valueKind?: ExpectedSlotValueKind;
  };
}

/** One concept acquired during the conversation. */
export interface AgentConcept {
  category: string;
  values: string[];
  kind?: ConceptKind;
  unit?: string;
}

export interface AgentSessionState {
  /** Concepts acquired during the conversation (VB sole source of truth). */
  acquiredConcepts: AgentConcept[];
  /** Attributo categories committed via an explicit disambiguation option pick. */
  exactAttributoCategories?: string[];
  selectedPath: string | null;
  noMatchCount: number;
  lastTranscript?: string;
  pendingExpectedInput?: PendingSlotContract[] | null;
}

export function initAgentSession(): AgentSessionState {
  return { acquiredConcepts: [], exactAttributoCategories: [], selectedPath: null, noMatchCount: 0 };
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
