/**
 * Builds ElevenLabs inline webhook tool for dumb voice relay dialog turns.
 */
import { buildAgentDialogStepWebhookUrl } from './convaiDevTunnel';

export const AGENT_DIALOG_STEP_TOOL_NAME = 'agent_dialog_step';

/** ElevenLabs-compatible webhook tool schema for transcript-only relay turns. */
export function buildAgentDialogStepTool(documentId: string, origin?: string) {
  return {
    type: 'webhook' as const,
    name: AGENT_DIALOG_STEP_TOOL_NAME,
    description:
      'Obbligatorio a ogni turno utente. Invia la trascrizione fedele della frase utente. '
      + 'Il backend decide logica dialogo e restituisce spokenHint: pronuncialo esattamente.',
    api_schema: {
      url: buildAgentDialogStepWebhookUrl(documentId, origin),
      method: 'POST' as const,
      request_body_schema: {
        type: 'object',
        description:
          'Turno relay: transcript utente. Il backend carica il bundle pubblicato per documentId.',
        properties: {
          conversationId: {
            type: 'string',
            dynamic_variable: 'system__conversation_id',
          },
          transcript: {
            type: 'string',
            description: 'Trascrizione fedele della frase pronunciata dall\'utente in questo turno',
          },
        },
        required: ['conversationId', 'transcript'],
      },
    },
    response_timeout_secs: 20,
  };
}
