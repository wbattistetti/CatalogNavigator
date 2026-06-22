/**
 * Calls OpenAI to generate natural disambiguation messages for plan signatures.
 */
import type { DisambiguationEditorRow } from './disambiguationPlanMessages';
import type { DisambiguationMessageRecord } from './disambiguationPlanTypes';
import {
  buildDisambiguationMessagesCorrection,
  buildDisambiguationMessagesUserMessage,
  DISAMBIGUATION_MESSAGES_PROMPT,
  parseDisambiguationAiContent,
  processDisambiguationMessagesAiResponse,
} from './analyzeDisambiguationMessages';
import { invokeFunction } from './invokeFunction';

const CHUNK_SIZE = 12;

export interface GenerateDisambiguationMessagesProgress {
  processedMessages: number;
  totalMessages: number;
  processedChunks: number;
  totalChunks: number;
}

export interface RunGenerateDisambiguationMessagesOptions {
  onProgress?: (progress: GenerateDisambiguationMessagesProgress) => void;
}

interface OpenAiProxyResponse {
  content?: string;
}

async function callOpenAi(
  userMessage: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const data = await invokeFunction<OpenAiProxyResponse>('analyze-document', {
    systemPrompt: DISAMBIGUATION_MESSAGES_PROMPT,
    userMessage,
  }, signal);

  if (typeof data.content !== 'string') {
    throw new Error('Risposta AI non valida: manca il contenuto');
  }
  return parseDisambiguationAiContent(data.content);
}

/** Generates fluent questions for a batch of disambiguation editor rows. */
export async function runGenerateDisambiguationMessages(
  rows: DisambiguationEditorRow[],
  documentName: string,
  documentText?: string,
  signal?: AbortSignal,
  options?: RunGenerateDisambiguationMessagesOptions,
): Promise<DisambiguationMessageRecord[]> {
  if (rows.length === 0) return [];

  const allResults: DisambiguationMessageRecord[] = [];
  const totalMessages = rows.length;
  const totalChunks = Math.ceil(totalMessages / CHUNK_SIZE);

  const reportProgress = (processedMessages: number, processedChunks: number) => {
    options?.onProgress?.({
      processedMessages,
      totalMessages,
      processedChunks,
      totalChunks,
    });
  };

  reportProgress(0, 0);

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    if (signal?.aborted) throw new DOMException('Generazione annullata', 'AbortError');
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const chunkIndex = Math.floor(i / CHUNK_SIZE) + 1;
    let lastError = '';

    for (let attempt = 0; attempt < 2; attempt++) {
      if (signal?.aborted) throw new DOMException('Generazione annullata', 'AbortError');
      const correction = attempt === 0 ? '' : buildDisambiguationMessagesCorrection(lastError);
      try {
        const raw = await callOpenAi(
          buildDisambiguationMessagesUserMessage(chunk, documentName, documentText, correction),
          signal,
        );
        const parsed = processDisambiguationMessagesAiResponse(chunk, raw);
        allResults.push(...parsed);
        break;
      } catch (err) {
        if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) throw err;
        lastError = err instanceof Error ? err.message : String(err);
        if (attempt === 1) throw err;
      }
    }

    reportProgress(Math.min(i + chunk.length, totalMessages), chunkIndex);
  }

  return allResults;
}
