/**
 * Generates discursive confirmation phrases for leaf slots via OpenAI proxy.
 */
import { invokeFunction } from './invokeFunction';
import { CONFIRMATION_SYSTEM_PROMPT } from './confirmationPrompts';
import {
  processConfirmationAiResponse,
  type LeafConfirmationInput,
} from './confirmAiPostProcess';

const CHUNK_SIZE = 20;

interface OpenAiProxyResponse {
  rows: unknown[];
}

async function callConfirmationProxy(items: LeafConfirmationInput[]): Promise<Map<string, string>> {
  const slots = items.map((i) => i.slot_filling);
  const lines = items.map(
    (i) => `- slot: ${i.slot_filling}\n  descrizione corpus: ${i.description}`,
  );

  const userMessage = `Genera la frase di conferma discorsiva per ciascuna foglia:

${lines.join('\n\n')}`;

  const data = await invokeFunction<OpenAiProxyResponse>('analyze-document', {
    systemPrompt: CONFIRMATION_SYSTEM_PROMPT,
    userMessage,
  });

  if (!Array.isArray(data.rows)) {
    throw new Error('Risposta AI non valida: manca l\'array rows');
  }

  return processConfirmationAiResponse(slots, data.rows);
}

/** Generates confirmation_text for all leaf items, batching to avoid truncation. */
export async function runGenerateConfirmations(
  items: LeafConfirmationInput[],
): Promise<Map<string, string>> {
  if (items.length === 0) throw new Error('Nessuna foglia da confermare');

  const merged = new Map<string, string>();

  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    const chunkResult = await callConfirmationProxy(chunk);
    for (const [slot, text] of chunkResult) merged.set(slot, text);
  }

  return merged;
}
