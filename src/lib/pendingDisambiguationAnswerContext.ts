/**
 * Explicit answer context: ties a user utterance to the disambiguation question it replies to.
 * Survives vbSession round-trip loss (pending disambiguation cache vs chat bubble metadata).
 */
import type { AgentSessionState, ExpectedSlotValueKind } from './agentBundleTypes';
import type { PendingDisambiguationContext } from './chatUserTurnRecognition';
import { sameOptionTokenSets } from './catalogDisambiguationOptions';

/** Semantic anchor for a user reply to a disambiguation (or ask_age) prompt. */
export interface PendingDisambiguationAnswerContext {
  categoryName: string;
  options: string[];
  signature?: string;
  valueKind?: ExpectedSlotValueKind;
}

export function buildAnswerContextFromPending(
  pending: PendingDisambiguationContext | null | undefined,
): PendingDisambiguationAnswerContext | undefined {
  if (!pending?.categoryName?.trim()) return undefined;
  const options = (pending.options ?? []).map((o) => o.trim()).filter(Boolean);
  if (options.length === 0) return undefined;
  return {
    categoryName: pending.categoryName.trim(),
    options,
    ...(pending.signature?.trim() ? { signature: pending.signature.trim() } : {}),
    valueKind: 'canonical_token',
  };
}

function normalizeCategory(name: string | undefined): string {
  return name?.trim().toLowerCase() ?? '';
}

/** True when session pending matches the bubble the user is answering. */
export function sessionPendingMatchesContext(
  session: AgentSessionState | null | undefined,
  context: PendingDisambiguationAnswerContext | undefined,
): boolean {
  if (!context?.categoryName?.trim()) return true;
  const pending = session?.pendingExpectedInput?.[0];
  if (!pending) return false;
  if (normalizeCategory(pending.categoryName) !== normalizeCategory(context.categoryName)) return false;
  if (pending.valueKind !== (context.valueKind ?? 'canonical_token')) return false;
  const sessionTokens = pending.allowedTokens ?? context.options;
  return sameOptionTokenSets(sessionTokens, context.options);
}

/** Human-readable hint when chat bubble and vbSession pending diverge. */
export function describePendingSessionMismatch(
  session: AgentSessionState | null | undefined,
  context: PendingDisambiguationAnswerContext | undefined,
): string | null {
  if (!context?.categoryName?.trim()) return null;
  if (sessionPendingMatchesContext(session, context)) return null;
  const pending = session?.pendingExpectedInput?.[0];
  if (!pending) {
    return 'Pending disambiguazione assente in vbSession: inviato contesto risposta dalla bolla agent.';
  }
  return `Pending vbSession (${pending.categoryName}) ≠ domanda in chat (${context.categoryName}): inviato contesto risposta esplicito.`;
}
