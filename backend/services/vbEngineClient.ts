/**
 * HTTP client for the VB.NET DialogEngine (sole runtime for agent turns).
 */
import type { AgentBundle, AgentSessionState } from '../../src/lib/agentBundleTypes';
import { parseValueSetKey } from './valueSet';
import type { AgentDialogStepHttpResponse } from '../../src/lib/agentDialogStepResponse';

const VB_ENGINE_URL = process.env.DIALOG_ENGINE_URL ?? 'http://127.0.0.1:5190';

export function initAgentSession(): AgentSessionState {
  return { acquiredConcepts: [], selectedPath: null, noMatchCount: 0 };
}

export interface VbAgentTurnParams {
  bundle: AgentBundle;
  state: AgentSessionState | null;
  conversationId?: string;
  documentId?: string;
  incomingSlots?: { categoryName: string; value: string }[];
  transcript?: string;
  reset?: boolean;
  confirmImplicitConcepts?: boolean;
}

export async function postVbAgentTurn(params: VbAgentTurnParams): Promise<AgentDialogStepHttpResponse & { nextState?: AgentSessionState }> {
  const incomingConcepts = (params.incomingSlots ?? []).map((slot) => ({
    category: slot.categoryName,
    values: parseValueSetKey(slot.value),
  }));

  const res = await fetch(`${VB_ENGINE_URL}/api/runtime/agent-turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bundle: convertAgentBundleToVb(params.bundle),
      state: convertSessionStateToVb(params.state),
      conversationId: params.conversationId,
      documentId: params.documentId,
      incomingConcepts,
      incomingSlots: params.incomingSlots,
      transcript: params.transcript,
      reset: params.reset ?? false,
      confirmImplicitConcepts: params.confirmImplicitConcepts ?? false,
    }),
  });

  const body = await res.json() as AgentDialogStepHttpResponse & { debug?: { nextState?: unknown }; nextState?: unknown };
  if (!res.ok) {
    throw new Error(typeof (body as { error?: string }).error === 'string' ? (body as { error: string }).error : `VB engine HTTP ${res.status}`);
  }

  const rawNext = body.debug?.nextState ?? body.nextState;
  const nextState = convertSessionStateFromVb(rawNext);
  return { ...body, nextState: nextState ?? undefined };
}

export async function pingVbEngine(): Promise<boolean> {
  try {
    const res = await fetch(`${VB_ENGINE_URL}/health`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}
