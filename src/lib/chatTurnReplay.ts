/**
 * Replays VB chat turns: rebuild session state before a user bubble and re-submit it.
 */
import type { AgentBundle, AgentSessionState } from './agentBundleTypes';
import { initAgentSession } from './agentBundleTypes';
import type { PendingDisambiguationContext } from './chatUserTurnRecognition';
import { resolvePendingDisambiguationContext } from './chatUserTurnRecognition';
import { buildAnswerContextFromPending } from './pendingDisambiguationAnswerContext';
import { resolveBubbleDisambiguationSignature } from './resolveBubbleDisambiguationSignature';
import { postVbTextTurn } from './vbTestEngineClient';

export interface ChatReplayMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
  disambiguationSignature?: string;
  disambiguationCategory?: string;
  disambiguationOptions?: string[];
}

/** Replays all turns strictly before targetUserIndex to rebuild VB session. */
export async function rebuildVbSessionBeforeUserMessage(params: {
  messages: readonly ChatReplayMessage[];
  targetUserIndex: number;
  bundle: AgentBundle;
}): Promise<AgentSessionState> {
  const { messages, targetUserIndex, bundle } = params;
  if (targetUserIndex <= 0) return initAgentSession();

  let state: AgentSessionState = initAgentSession();
  let firstUserTurn = true;

  for (let i = 0; i < targetUserIndex; i += 1) {
    const msg = messages[i]!;
    if (msg.role !== 'user') continue;

    const pending = resolvePendingDisambiguationContext(
      messages.slice(0, i).map((m) => ({
        role: m.role,
        disambiguationSignature: m.disambiguationSignature,
        disambiguationCategory: m.disambiguationCategory,
        disambiguationOptions: m.disambiguationOptions,
      })),
    );
    const answerContext = buildAnswerContextFromPending(pending);

    const result = await postVbTextTurn({
      userText: msg.text,
      bundle,
      state,
      reset: firstUserTurn,
      answerContext,
    });
    state = result.nextState ?? state;
    firstUserTurn = false;
  }

  return state;
}

export function findUserMessageIndex(
  messages: readonly ChatReplayMessage[],
  userMessageId: string,
): number {
  return messages.findIndex((m) => m.id === userMessageId && m.role === 'user');
}

export function pendingContextBeforeUserMessage(
  messages: readonly ChatReplayMessage[],
  targetUserIndex: number,
): PendingDisambiguationContext | null {
  return resolvePendingDisambiguationContext(
    messages.slice(0, targetUserIndex).map((m) => ({
      role: m.role,
      disambiguationSignature: m.disambiguationSignature ?? resolveBubbleDisambiguationSignature(m) ?? undefined,
      disambiguationCategory: m.disambiguationCategory,
      disambiguationOptions: m.disambiguationOptions,
    })),
  );
}
