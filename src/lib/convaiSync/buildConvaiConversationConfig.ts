/**
 * Builds ElevenLabs conversation_config for slot-filling + webhook-controlled dialog.
 */
import type { AgentBundle } from '../agentBundleTypes';
import { normalizeCategoryOrders } from '../dictionaryTree';
import { buildAgentDialogStepTool } from './buildAgentDialogStepTool';

export interface ConvaiConversationConfigInput {
  bundle: AgentBundle;
  documentId: string;
  firstMessage?: string | null;
  voiceId?: string | null;
  llm?: string;
  gatewayOrigin?: string;
}

function buildCategoryCatalogForVoiceAgent(bundle: AgentBundle): string {
  const categories = normalizeCategoryOrders(bundle.dictionary.categories ?? [])
    .filter((c) => c.tokenTexts.length > 0);
  const lines = categories.map((c) => {
    const type = c.type === 'vincolo' ? 'vincolo' : 'attributo';
    if (type === 'vincolo') {
      return `- ${c.name} (${type}): il backend chiede il dato necessario (es. età in anni); NON usare questi token come risposta utente`;
    }
    return `- ${c.name} (${type}): ${c.tokenTexts.join(', ')}`;
  });
  return lines.join('\n');
}

function compileVoiceAgentPrompt(bundle: AgentBundle): string {
  const catalog = buildCategoryCatalogForVoiceAgent(bundle);
  return [
    'Sei un assistente vocale per prenotazione prestazioni mediche.',
    `Dominio: ${bundle.meta.documentName}. Lingua: italiano.`,
    '',
    'RUOLO: estrai slot dalla frase utente e chiama SEMPRE il tool agent_dialog_step.',
    'NON scegliere prestazioni, NON applicare vincoli, NON disambiguare da solo.',
    '',
    'CATALOGO CATEGORIE (usa etichette esatte + token canonici):',
    catalog,
    '',
    'OUTPUT TOOL (ogni turno):',
    '- incomingSlots: [{ categoryName: "NOME CATEGORIA", value: "token" }]',
    '- transcript: frase utente (opzionale)',
    '(conversationId è iniettato automaticamente da ElevenLabs; non inventarlo.)',
    '',
    'DOPO OGNI RISPOSTA DEL TOOL agent_dialog_step:',
    '- Leggi spokenHint: indizio per cosa DIRE (parafrasalo in italiano naturale).',
    '- Leggi instruction.expectedInput: contratto per cosa INVIARE nel prossimo tool call.',
    '- Compila incomingSlots secondo expectedInput.slots (categoryName + valueKind).',
    '- Se c\'è pendingExpectedInput dal turno precedente, invia SOLO quelle categorie — nessun altro slot.',
    '- Per valueKind age_years: value = solo numero intero anni (es. "30"), MAI token fascia/vincolo.',
    '- Per valueKind canonical_token: value = token esatto da options o catalogo attributo.',
    '- Usa instruction.action solo come riferimento; expectedInput ha priorità su incomingSlots.',
    '- IGNORA debug, log, parsedBlock, nextState e candidateCount nel parlato.',
  ].join('\n');
}

/** Default EU voice used when none is configured (matches common Omnia deploy). */
export const DEFAULT_CONVAI_VOICE_ID = 'JfznbVXrGXYh0gZo9Lcp';

/** Assembles full conversation_config for create/patch agent. */
export function buildConvaiConversationConfig(input: ConvaiConversationConfigInput) {
  const prompt = compileVoiceAgentPrompt(input.bundle);
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
        llm: input.llm ?? 'gpt-4o',
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
