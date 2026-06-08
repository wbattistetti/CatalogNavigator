/**
 * Orchestrates OpenAI analysis: builds prompts client-side, calls edge proxy, post-processes.
 */
import type { AnalysisRow } from '../hooks/useAnalysis';
import { invokeFunction } from './invokeFunction';
import { processNluAiResponse, processTaxonomyAiResponse } from './analyzeAiPostProcess';
import {
  buildAgentCorrectionMessage,
  buildGenerateAgentUserMessage,
  buildRefineTaxonomyUserMessage,
  buildRegenCorrectionMessage,
  buildRegenSubtreeUserMessage,
  buildTaxonomyUserMessage,
} from './analyzeDocumentMessages';
import {
  GENERATE_AGENT_PROMPT,
  REFINE_TAXONOMY_SYSTEM_PROMPT,
  REGEN_SYSTEM_PROMPT,
  TAXONOMY_SYSTEM_PROMPT,
} from './analyzeDocumentPrompts';

interface OpenAiProxyResponse {
  rows: unknown[];
}

async function callOpenAiProxy(
  systemPrompt: string,
  userMessage: string,
  signal?: AbortSignal,
): Promise<unknown[]> {
  const data = await invokeFunction<OpenAiProxyResponse>('analyze-document', {
    systemPrompt,
    userMessage,
  }, signal);
  if (!Array.isArray(data.rows)) {
    throw new Error('Risposta AI non valida: manca l\'array rows');
  }
  return data.rows;
}

async function callNluWithRetry(
  systemPrompt: string,
  buildMessage: (correction: string) => string,
  slots: string[],
  buildCorrection: (err: string) => string,
  signal?: AbortSignal,
): Promise<AnalysisRow[]> {
  let lastError = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal?.aborted) throw new DOMException('Generazione annullata', 'AbortError');
    const correction = attempt === 0 ? '' : buildCorrection(lastError);
    try {
      const rawRows = await callOpenAiProxy(systemPrompt, buildMessage(correction), signal);
      return processNluAiResponse(slots, rawRows);
    } catch (err) {
      if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) throw err;
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt === 1) throw err;
    }
  }
  throw new Error(lastError || 'Generazione NLU fallita');
}

/** Generates taxonomy rows from document text. */
export async function runGenerateTaxonomy(
  documentText: string,
  documentName: string,
  signal?: AbortSignal,
): Promise<AnalysisRow[]> {
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
): Promise<AnalysisRow[]> {
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
): Promise<AnalysisRow[]> {
  return callNluWithRetry(
    REGEN_SYSTEM_PROMPT,
    (correction) => buildRegenSubtreeUserMessage(slots, rootSlot, documentName, documentText, correction),
    slots,
    buildRegenCorrectionMessage,
    signal,
  );
}
