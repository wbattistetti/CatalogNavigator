/**
 * Types for auto-generated dialog regression scripts (Test Plan tab).
 */
import type { ChatTurnDebug } from '../chatTurnDebug';
import type { UserTurnRecognition } from '../chatUserTurnRecognition';

export type DialogTestFamily = 'minimal' | 'intermediate' | 'complete';

export type DialogTestRunStatus =
  | 'idle'
  | 'running'
  | 'pass'
  | 'fail'
  | 'stuck'
  | 'unreachable'
  | 'skipped';

export interface DialogTestScript {
  family: DialogTestFamily;
  userSteps: string[];
}

export interface DialogTestVoice {
  id: string;
  sourceText: string;
  targetPath: string;
  /** Catalog item exists and script has at least one step. */
  reachable: boolean;
  /** Target path found in compiled bundle.corpusItems. */
  catalogItemFound: boolean;
  /** Engine-order user steps from guided disambiguation path (+ age if required). */
  canonicalTokens: string[];
  scripts: Record<DialogTestFamily, DialogTestScript>;
}

export interface DialogTestTurnRecord {
  userText: string;
  action?: string;
  selectedPath?: string | null;
  spokenHint?: string;
  disambiguationCategory?: string;
  disambiguationOptions?: string[];
  disambiguationSignature?: string;
  candidatePaths?: string[];
  hintSource?: 'disambiguation_plan' | 'disambiguation_plan_no_match' | 'template' | string;
  turnDebug?: ChatTurnDebug;
  turnRecognition?: UserTurnRecognition;
  turnStuckReasons?: string[];
}

export interface DialogTestRunResult {
  status: Exclude<DialogTestRunStatus, 'idle' | 'running'>;
  reason?: string;
  finalPath?: string | null;
  transcript: DialogTestTurnRecord[];
  durationMs?: number;
}

export interface DialogTestPlan {
  voices: DialogTestVoice[];
  generatedAt: string;
}

export interface DialogTestFamilyRunState {
  status: DialogTestRunStatus;
  transcript?: DialogTestTurnRecord[];
  finalPath?: string | null;
  result?: DialogTestRunResult;
  error?: string;
}

export interface DialogTestManualSession {
  id: string;
  label: string;
}

export const DIALOG_TEST_FAMILIES: DialogTestFamily[] = ['minimal', 'intermediate', 'complete'];

export const DIALOG_TEST_FAMILY_LABELS: Record<DialogTestFamily, string> = {
  minimal: 'Minimi',
  intermediate: '3/4',
  complete: 'One-shot',
};

/** Short hint shown under each family column header. */
export const DIALOG_TEST_FAMILY_HINTS: Record<DialogTestFamily, string> = {
  minimal: '1 token catalogo per turno',
  intermediate: 'Apertura naturale + token raggruppati',
  complete: 'Apertura naturale + tutti i token in un messaggio',
};
