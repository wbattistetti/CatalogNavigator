/**
 * Builds read-only chat message lists for Test Plan transcript UI.
 */
import type { DialogTestTurnRecord } from './dialogTestPlanTypes';
import { turnHasRecognitionWarning } from './dialogTestPlanTurnEvaluation';

export interface TestPlanChatMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
  isResult?: boolean;
  resultPath?: string | null;
  disambiguationCategory?: string;
  disambiguationOptions?: string[];
  hintSource?: string;
  turnStuckReasons?: string[];
  hasRecognitionWarning?: boolean;
}

/** Maps VB turn records + opening question into alternating user/agent bubbles. */
export function buildTestPlanChatMessages(
  startQuestion: string | undefined,
  transcript: readonly DialogTestTurnRecord[],
  finalPath?: string | null,
): TestPlanChatMessage[] {
  const messages: TestPlanChatMessage[] = [];
  const opening = startQuestion?.trim();
  if (opening) {
    messages.push({ id: 'opening', role: 'agent', text: opening });
  }

  transcript.forEach((turn, index) => {
    messages.push({
      id: `user-${index}`,
      role: 'user',
      text: turn.userText,
      hasRecognitionWarning: turnHasRecognitionWarning(turn) || undefined,
    });

    const agentText = turn.spokenHint?.trim();
    if (!agentText) return;

    const isConfirm = turn.action === 'confirm' && !!turn.selectedPath;
    messages.push({
      id: `agent-${index}`,
      role: 'agent',
      text: agentText,
      isResult: isConfirm,
      resultPath: isConfirm ? (turn.selectedPath ?? finalPath ?? null) : undefined,
      disambiguationCategory: turn.disambiguationCategory,
      disambiguationOptions: turn.disambiguationOptions,
      hintSource: turn.hintSource,
      turnStuckReasons: turn.turnStuckReasons,
    });
  });

  if (finalPath && messages.length > 0 && !messages.some((m) => m.isResult)) {
    messages.push({
      id: 'confirm',
      role: 'agent',
      text: 'Prestazione confermata.',
      isResult: true,
      resultPath: finalPath,
    });
  }

  return messages;
}
