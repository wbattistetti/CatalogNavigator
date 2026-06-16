/**
 * ElevenLabs conversation_config for LLM-only dialog (structured KB + algorithm prompt, no webhook).
 */
import type { AgentBundle } from '../agentBundleTypes';
import { compileStructuredConvaiSystemPrompt } from '../convaiStructuredExport';
import { normalizeCategoryOrders } from '../dictionaryTree';
import type { ConvaiKbRef } from './convaiKbExtract';
import { DEFAULT_CONVAI_VOICE_ID } from './buildConvaiConversationConfig';

export interface ConvaiNoBackendConfigInput {
  bundle: AgentBundle;
  kbRefs: ConvaiKbRef[];
  firstMessage?: string | null;
  voiceId?: string | null;
  llm?: string;
}

/** Assembles conversation_config with structured prompt and KB attachments — no tools. */
export function buildConvaiConversationConfigNoBackend(
  input: ConvaiNoBackendConfigInput,
): Record<string, unknown> {
  const categories = normalizeCategoryOrders(input.bundle.dictionary.categories ?? []);
  const prompt = compileStructuredConvaiSystemPrompt({
    documentName: input.bundle.meta.documentName,
    startQuestion: input.bundle.analysis.start_question?.trim() || null,
    confirmationPreamble: input.bundle.analysis.confirmation_preamble?.trim() || null,
    categories,
  });
  const voiceId = input.voiceId?.trim() || DEFAULT_CONVAI_VOICE_ID;

  return {
    agent: {
      first_message: input.firstMessage?.trim()
        || input.bundle.analysis.start_question?.trim()
        || 'Come posso aiutarla?',
      language: 'it',
      prompt: {
        prompt,
        llm: input.llm ?? 'gpt-4o',
        tools: [] as unknown[],
        tool_ids: [] as string[],
        knowledge_base: input.kbRefs,
      },
    },
    tts: {
      voice_id: voiceId,
      model_id: 'eleven_flash_v2_5',
    },
  };
}
