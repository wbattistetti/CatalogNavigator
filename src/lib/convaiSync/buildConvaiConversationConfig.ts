/**
 * Builds ElevenLabs conversation_config for dumb voice relay (STT/TTS + webhook).
 */
import type { AgentBundle } from '../agentBundleTypes';
import { buildAgentDialogStepTool } from './buildAgentDialogStepTool';

export interface ConvaiConversationConfigInput {
  bundle: AgentBundle;
  documentId: string;
  firstMessage?: string | null;
  voiceId?: string | null;
  llm?: string;
  gatewayOrigin?: string;
}

/** System prompt: ConvAI relays transcript to backend and speaks spokenHint verbatim. */
export function compileVoiceRelayPrompt(bundle: AgentBundle): string {
  return [
    'Sei un ponte vocale per prenotazione prestazioni mediche.',
    `Dominio: ${bundle.meta.documentName}. Lingua: italiano.`,
    '',
    'NON ragioni, NON estrai informazioni, NON decidi nulla, NON parafrasi.',
    '',
    'A ogni turno in cui l\'utente parla:',
    '1. Trascrivi fedelmente ciò che dice l\'utente.',
    '2. Chiama SEMPRE il tool agent_dialog_step con conversationId e transcript.',
    '   (conversationId è iniettato automaticamente da ElevenLabs; non inventarlo.)',
    '3. Dalla risposta del tool, pronuncia ESATTAMENTE il campo spokenHint.',
    '   Non aggiungere, non omettere, non riformulare.',
    '4. Ignora instruction, debug, parsedBlock, candidateCount e expectedInput.',
    '',
    'Se spokenHint è vuoto, chiedi brevemente di ripetere.',
  ].join('\n');
}

/** Default EU voice used when none is configured (matches common Omnia deploy). */
export const DEFAULT_CONVAI_VOICE_ID = 'JfznbVXrGXYh0gZo9Lcp';

/** Default LLM for relay mode — minimal orchestration (tool call + read response). */
export const DEFAULT_CONVAI_RELAY_LLM = 'gpt-4o-mini';

/** Assembles full conversation_config for create/patch agent (dumb relay). */
export function buildConvaiConversationConfig(input: ConvaiConversationConfigInput) {
  const prompt = compileVoiceRelayPrompt(input.bundle);
  const tool = buildAgentDialogStepTool(input.documentId, input.gatewayOrigin);
  const voiceId = input.voiceId?.trim() || DEFAULT_CONVAI_VOICE_ID;

  const conversationConfig: Record<string, unknown> = {
    agent: {
      first_message: input.firstMessage?.trim()
        || input.bundle.analysis.start_question?.trim()
        || 'Come posso aiutarla?',
      language: 'it',
      prompt: {
        prompt,
        llm: input.llm ?? DEFAULT_CONVAI_RELAY_LLM,
        tools: [tool],
        knowledge_base: [] as Array<{ type: string; name: string; id: string; usage_mode: string }>,
      },
    },
    tts: {
      voice_id: voiceId,
      model_id: 'eleven_flash_v2_5',
    },
  };

  // tool_ids: [] only on PATCH (stripPromptToolIdsForInlineToolsPatch), not on create.
  return conversationConfig;
}
