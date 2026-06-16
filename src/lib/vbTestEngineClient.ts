/**
 * HTTP client for the VB.NET DialogEngine (chat test + runtime).
 */
import type {
  AgentBundle,
  AgentSessionState,
  AgentTurnInstruction,
} from './agentBundleTypes';
import { initAgentSession } from './agentBundleTypes';
import {
  convertAgentBundleToVb,
  convertSessionStateFromVb,
  convertSessionStateToVb,
} from './convertAgentBundleToVb';

const VB_ENGINE_BASE = import.meta.env.VITE_VB_ENGINE_URL ?? '/vb-engine';

export interface VbTextTurnResponse {
  ok: boolean;
  spokenHint?: string;
  selectedPath?: string | null;
  nextState?: AgentSessionState;
  instruction?: AgentTurnInstruction;
  parsed?: { category: string; value: string; kind?: string }[];
  candidateCount?: number;
  candidatePaths?: string[];
  debug?: {
    log?: string;
    parsedBlock?: string;
  };
  error?: string;
}

export function isVbTestEngineEnabled(): boolean {
  return import.meta.env.VITE_VB_TEST_ENGINE !== 'false';
}

export function shouldUseVbTestEngine(bundle: AgentBundle | null | undefined): boolean {
  return isVbTestEngineEnabled() && bundle != null && bundle.corpusItems.length > 0;
}

export async function postVbTextTurn(params: {
  userText: string;
  bundle: AgentBundle;
  state: AgentSessionState | null;
  reset?: boolean;
}): Promise<VbTextTurnResponse> {
  const res = await fetch(`${VB_ENGINE_BASE}/api/test/text-turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userText: params.userText,
      bundle: convertAgentBundleToVb(params.bundle),
      state: convertSessionStateToVb(params.state ?? initAgentSession()),
      reset: params.reset ?? false,
    }),
  });

  const body = await res.json() as VbTextTurnResponse;
  if (!res.ok) {
    throw new Error(body.error ?? `VB engine HTTP ${res.status}`);
  }

  if (body.nextState) {
    body.nextState = convertSessionStateFromVb(body.nextState) ?? initAgentSession();
  }

  return body;
}

export async function pingVbEngine(): Promise<boolean> {
  try {
    const res = await fetch(`${VB_ENGINE_BASE}/health`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

export { initAgentSession };
