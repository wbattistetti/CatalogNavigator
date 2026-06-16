/**
 * Orchestrates OpenAI analysis: builds prompts client-side, calls edge proxy, post-processes.
 */
import type { AnalysisRow } from '../hooks/useAnalysis';
import { getInteractiveMessageSlots } from './analysisTree';
import type { TokenCategory } from './dictionaryTree';
import { coerceAiResponseToRows, parseOpenAiContent } from './coerceAiRows';
import { invokeFunction } from './invokeFunction';
import type { TaxonomyBuildResult } from './analyzeAiPostProcess';
import {
  processGrammarsAiResponse,
  processMessagesAiResponse,
  processNluAiResponse,
  processTaxonomyAiResponse,
} from './analyzeAiPostProcess';
import {
  buildAgentCorrectionMessage,
  buildGenerateAgentUserMessage,
  buildGrammarsCorrectionMessage,
  buildMessagesCorrectionMessage,
  buildRefineTaxonomyUserMessage,
  buildRegenCorrectionMessage,
  buildRegenGrammarsSubtreeUserMessage,
  buildRegenMessagesSubtreeUserMessage,
  buildRegenSubtreeUserMessage,
  buildTaxonomyUserMessage,
} from './analyzeDocumentMessages';
import {
  GENERATE_AGENT_PROMPT,
  REFINE_TAXONOMY_SYSTEM_PROMPT,
  REGEN_GRAMMARS_PROMPT,
  REGEN_MESSAGES_PROMPT,
  REGEN_SYSTEM_PROMPT,
  TAXONOMY_SYSTEM_PROMPT,
} from './analyzeDocumentPrompts';

interface OpenAiProxyResponse {
  content?: string;
  /** @deprecated Legacy edge responses — parsing now happens client-side. */
  rows?: unknown[];
}

interface OpenAiProxyOptions {
  model?: string;
  maxTokens?: number;
}

async function callOpenAiProxy(
  systemPrompt: string,
  userMessage: string,
  signal?: AbortSignal,
  options?: OpenAiProxyOptions,
): Promise<unknown[]> {
  const data = await invokeFunction<OpenAiProxyResponse>('analyze-document', {
    systemPrompt,
    userMessage,
    model: options?.model,
    maxTokens: options?.maxTokens,
  }, signal);

  if (typeof data.content === 'string') {
    return parseOpenAiContent(data.content);
  }

  // Backward compat with older edge deployments that still return { rows }.
  if (Array.isArray(data.rows)) return data.rows;
  try {
    return coerceAiResponseToRows(data);
  } catch {
    throw new Error('Risposta AI non valida: manca il contenuto OpenAI');
  }
}

async function callLayerWithRetry(
  systemPrompt: string,
  buildMessage: (correction: string) => string,
  slots: string[],
  buildCorrection: (err: string) => string,
  process: (slots: string[], rawRows: unknown[], itemPaths?: string[] | null) => AnalysisRow[],
  signal?: AbortSignal,
  proxyOptions?: OpenAiProxyOptions,
  itemPaths?: string[] | null,
): Promise<AnalysisRow[]> {
  let lastError = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal?.aborted) throw new DOMException('Generazione annullata', 'AbortError');
    const correction = attempt === 0 ? '' : buildCorrection(lastError);
    try {
      const rawRows = await callOpenAiProxy(systemPrompt, buildMessage(correction), signal, proxyOptions);
      return process(slots, rawRows, itemPaths);
    } catch (err) {
      if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) throw err;
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt === 1) throw err;
    }
  }
  throw new Error(lastError || 'Generazione NLU fallita');
}

async function callNluWithRetry(
  systemPrompt: string,
  buildMessage: (correction: string) => string,
  slots: string[],
  buildCorrection: (err: string) => string,
  signal?: AbortSignal,
  itemPaths?: string[] | null,
): Promise<AnalysisRow[]> {
  return callLayerWithRetry(
    systemPrompt, buildMessage, slots, buildCorrection, processNluAiResponse, signal, undefined, itemPaths,
  );
}

/** Generates taxonomy rows from document text. */
export async function runGenerateTaxonomy(
  documentText: string,
  documentName: string,
  signal?: AbortSignal,
): Promise<TaxonomyBuildResult> {
  const rawRows = await callOpenAiProxy(
    TAXONOMY_SYSTEM_PROMPT,
    buildTaxonomyUserMessage(documentText, documentName),
    signal,
  );
  return processTaxonomyAiResponse(rawRows);
}

/** Refines taxonomy from existing slots and user notes (no document). */
export async function runRefineTaxonomy(
  existingSlots: string[],
  refinementNotes: string,
): Promise<TaxonomyBuildResult> {
  const rawRows = await callOpenAiProxy(
    REFINE_TAXONOMY_SYSTEM_PROMPT,
    buildRefineTaxonomyUserMessage(existingSlots, refinementNotes),
  );
  return processTaxonomyAiResponse(rawRows);
}

/** Generates NLU layer (questions, grammars) for fixed taxonomy slots. */
export async function runGenerateAgent(
  slots: string[],
  documentName: string,
  documentText?: string,
): Promise<AnalysisRow[]> {
  return callNluWithRetry(
    GENERATE_AGENT_PROMPT,
    (correction) => buildGenerateAgentUserMessage(slots, documentName, documentText, correction),
    slots,
    buildAgentCorrectionMessage,
  );
}

/** Regenerates NLU for a subtree rooted at rootSlot. */
export async function runRegenSubtree(
  slots: string[],
  rootSlot: string,
  documentName: string,
  documentText?: string,
  signal?: AbortSignal,
  itemPaths?: string[] | null,
): Promise<AnalysisRow[]> {
  return callNluWithRetry(
    REGEN_SYSTEM_PROMPT,
    (correction) => buildRegenSubtreeUserMessage(slots, rootSlot, documentName, documentText, correction, itemPaths),
    slots,
    buildRegenCorrectionMessage,
    signal,
    itemPaths,
  );
}

/** Regenerates messages only for a subtree rooted at rootSlot. */
export async function runRegenMessagesSubtree(
  slots: string[],
  rootSlot: string,
  documentName: string,
  documentText?: string,
  signal?: AbortSignal,
  itemPaths?: string[] | null,
  categories?: TokenCategory[],
): Promise<AnalysisRow[]> {
  const interactiveSlots = getInteractiveMessageSlots(slots, itemPaths, categories);
  if (interactiveSlots.length === 0) {
    return processMessagesAiResponse(slots, [], itemPaths);
  }

  return callLayerWithRetry(
    REGEN_MESSAGES_PROMPT,
    (correction) => buildRegenMessagesSubtreeUserMessage(
      slots, rootSlot, documentName, documentText, correction, itemPaths, categories,
    ),
    slots,
    buildMessagesCorrectionMessage,
    processMessagesAiResponse,
    signal,
    undefined,
    itemPaths,
  );
}

/** Regenerates grammars for targetSlots within a subtree rooted at rootSlot. */
export async function runRegenGrammarsSubtree(
  targetSlots: string[],
  rootSlot: string,
  rows: AnalysisRow[],
  documentName: string,
  documentText?: string,
  incremental = true,
  signal?: AbortSignal,
): Promise<AnalysisRow[]> {
  return callLayerWithRetry(
    REGEN_GRAMMARS_PROMPT,
    (correction) => buildRegenGrammarsSubtreeUserMessage(
      targetSlots, rootSlot, rows, documentName, documentText, incremental, correction,
    ),
    targetSlots,
    buildGrammarsCorrectionMessage,
    processGrammarsAiResponse,
    signal,
    { model: 'gpt-4o-mini', maxTokens: 8192 },
  );
}
