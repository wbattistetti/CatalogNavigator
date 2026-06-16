/**
 * ElevenLabs inline webhook tools: PATCH must not send tools + tool_ids together.
 */

/** Clears workspace tool_ids when patching inline tools (prevents stale tool attachments). */
export function stripPromptToolIdsForInlineToolsPatch(
  conversationConfigOutbound: Record<string, unknown>,
): void {
  const agent = conversationConfigOutbound.agent;
  if (!agent || typeof agent !== 'object') return;
  const prompt = (agent as Record<string, unknown>).prompt;
  if (!prompt || typeof prompt !== 'object') return;
  (prompt as Record<string, unknown>).tool_ids = [];
}
