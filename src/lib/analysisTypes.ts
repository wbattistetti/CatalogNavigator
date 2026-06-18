/**
 * Shared analysis / agent row types (no hook or runtime imports).
 */

export interface GrammarEntry {
  regex: string;
  mappings: Record<string, string>;
}

/** Which inline grammar editor is open: node, category recognition, or question-answer routing. */
export type GrammarEditMode = 'node' | 'category' | 'answer';

export interface GrammarEditTarget {
  slot: string;
  mode: GrammarEditMode;
}

export type RowStatus = 'approved' | 'rejected' | 'uncertain' | null;

export type GeneratingPhase = 'taxonomy' | 'messages' | 'grammars' | null;

export type OntologySyncPhase = 'segmentation' | 'building';

export interface AgentGenProgress {
  current: number;
  total: number;
  rootSlot: string;
}

export type MessageReviewField =
  | 'question'
  | 'no_match_1'
  | 'no_match_2'
  | 'no_match_3'
  | 'confirmation_text';

export type MessageSource = 'deterministic' | 'ai' | 'manual';

export interface MessageFieldMeta {
  status?: RowStatus;
  source?: MessageSource;
}

export type MessageFieldMetaMap = Partial<Record<MessageReviewField, MessageFieldMeta>>;

export interface AnalysisRow {
  slot_filling: string;
  question: string | null;
  grammar: GrammarEntry | null;
  answer_grammar: GrammarEntry | null;
  no_match_1: string | null;
  no_match_2: string | null;
  no_match_3: string | null;
  confirmation_text: string | null;
  status?: RowStatus;
  field_meta?: MessageFieldMetaMap;
}

export interface Analysis {
  id: string;
  document_id: string;
  rows: AnalysisRow[];
  item_paths: string[] | null;
  start_question: string | null;
  confirmation_preamble: string | null;
  created_at: string;
  updated_at: string;
}
