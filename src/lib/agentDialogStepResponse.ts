/**
 * HTTP response shape for agent-dialog-step webhook (voice layer + debug).
 */
import type {
  AgentParsedSlot,
  AgentSessionState,
  AgentTurnInstruction,
  AgentTurnResult,
} from './agentBundleTypes';

export interface AgentDialogStepDebugPayload {
  log: string;
  parsed: AgentParsedSlot[];
  parsedBlock: string;
  candidatePaths?: string[];
  nextState: AgentSessionState;
}

export interface AgentDialogStepHttpResponse {
  ok: true;
  conversationId: string;
  documentId: string;
  instruction: AgentTurnInstruction;
  spokenHint: string;
  candidateCount: number;
  debug: AgentDialogStepDebugPayload;
}

export function formatAgentParsedBlock(
  parsed: AgentParsedSlot[],
  instruction: AgentTurnInstruction,
): string {
  const lines = parsed.map((p) => `${p.categoryName}: ${p.value}`);
  lines.push(`PROSSIMA_AZIONE: ${instruction.action}`);
  return `---PARSED---\n${lines.join('\n')}`;
}

export function formatInstructionLog(instruction: AgentTurnInstruction): string {
  switch (instruction.action) {
    case 'disambiguate':
      return `DISAMBIGUATE: category=${instruction.categoryName ?? '?'}`;
    case 'confirm_implicit':
      return `CONFIRM_IMPLICIT: category=${instruction.categoryName ?? '?'} value=${instruction.implicitValue ?? '?'}`;
    case 'ask_age':
      return 'ASK_CONSTRAINT: age_years';
    case 'confirm':
      return `CONFIRM: path=${instruction.path ?? '?'}`;
    case 'no_match':
      return 'NO_MATCH';
    case 'already_done':
      return `ALREADY_DONE: path=${instruction.path ?? '?'}`;
    default:
      return instruction.action;
  }
}

export function buildAgentDialogStepHttpResponse(
  conversationId: string,
  documentId: string,
  result: AgentTurnResult,
): AgentDialogStepHttpResponse {
  return {
    ok: true,
    conversationId,
    documentId,
    instruction: result.instruction,
    spokenHint: result.spokenHint,
    candidateCount: result.candidateCount,
    debug: {
      log: formatInstructionLog(result.instruction),
      parsed: result.parsed,
      parsedBlock: formatAgentParsedBlock(result.parsed, result.instruction),
      candidatePaths: result.candidatePaths,
      nextState: result.nextState,
    },
  };
}
