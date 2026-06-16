/**
 * In-memory agent dialog sessions keyed by conversationId (dev/MVP).
 */
import type { AgentBundle, AgentSessionState } from '../../src/lib/agentBundleTypes';
import { initAgentSession } from '../../src/lib/agentBundleTypes';

export interface AgentRuntimeSession {
  conversationId: string;
  documentId: string;
  bundle: AgentBundle;
  state: AgentSessionState;
  updatedAt: string;
}

const sessions = new Map<string, AgentRuntimeSession>();

export function getSession(conversationId: string): AgentRuntimeSession | null {
  return sessions.get(conversationId) ?? null;
}

export function upsertSession(
  conversationId: string,
  documentId: string,
  bundle: AgentBundle,
  state?: AgentSessionState,
): AgentRuntimeSession {
  const existing = sessions.get(conversationId);
  const session: AgentRuntimeSession = {
    conversationId,
    documentId,
    bundle,
    state: state ?? existing?.state ?? initAgentSession(),
    updatedAt: new Date().toISOString(),
  };
  sessions.set(conversationId, session);
  return session;
}

export function updateSessionState(
  conversationId: string,
  state: AgentSessionState,
): AgentRuntimeSession | null {
  const existing = sessions.get(conversationId);
  if (!existing) return null;
  const updated: AgentRuntimeSession = {
    ...existing,
    state,
    updatedAt: new Date().toISOString(),
  };
  sessions.set(conversationId, updated);
  return updated;
}
