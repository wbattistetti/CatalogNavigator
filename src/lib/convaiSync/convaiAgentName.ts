/**
 * Default ConvAI agent naming for Omnia document deploy.
 */

export const CONVAI_AGENT_NAME_PREFIX = 'R&D Omnia - ';

/** Suggested ElevenLabs agent name from the source document title. */
export function suggestConvaiAgentName(documentName: string): string {
  return `${CONVAI_AGENT_NAME_PREFIX}${documentName.trim()}`;
}
