/**
 * Builds ElevenLabs inline webhook tool for deterministic agent dialog step.
 */
import { buildAgentDialogStepWebhookUrl } from './convaiDevTunnel';

export const AGENT_DIALOG_STEP_TOOL_NAME = 'agent_dialog_step';

/** ElevenLabs-compatible webhook tool schema for slot-based dialog turns. */
export function buildAgentDialogStepTool(documentId: string, origin?: string) {
  return {
    type: 'webhook' as const,
    name: AGENT_DIALOG_STEP_TOOL_NAME,
    description:
      'Obbligatorio a ogni turno. Invia gli slot categoria→token estratti dalla frase utente. '
      + 'Il backend decide candidati, vincoli e prossima domanda. '
      + 'Usa spokenHint dalla risposta come indizio semantico da riformulare in italiano naturale.',
    api_schema: {
      url: buildAgentDialogStepWebhookUrl(documentId, origin),
      method: 'POST' as const,
      request_body_schema: {
        type: 'object',
        description:
          'Turno dialogo deterministico: slot NLU in incomingSlots. '
          + 'Il bundle è opzionale (il backend carica quello pubblicato per documentId).',
        properties: {
          conversationId: {
            type: 'string',
            dynamic_variable: 'system__conversation_id',
          },
          incomingSlots: {
            type: 'array',
            description: 'Slot estratti dal turno corrente (categoria dizionario + token canonico)',
            items: {
              type: 'object',
              properties: {
                categoryName: {
                  type: 'string',
                  description: 'Etichetta esatta della categoria dizionario',
                },
                value: {
                  type: 'string',
                  description: 'Token canonico associato alla categoria',
                },
              },
              required: ['categoryName', 'value'],
            },
          },
          transcript: {
            type: 'string',
            description: 'Testo utente (solo log, non usato per matching)',
          },
        },
        required: ['conversationId', 'incomingSlots'],
      },
    },
    response_timeout_secs: 20,
  };
}
