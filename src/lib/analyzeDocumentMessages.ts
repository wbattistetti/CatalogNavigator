/**
 * Builds user messages sent to OpenAI for each analysis mode.
 */
import type { AnalysisRow } from '../hooks/useAnalysis';
import {
  extractLeafPaths,
  formatGrammarsNodesSection,
  formatInternalNodesSection,
  formatMessagesNodesSection,
  formatSlotTree,
} from './analysisTree';

const DOCUMENT_TEXT_MAX = 12_000;

export function buildTaxonomyUserMessage(documentText: string, documentName: string): string {
  return (
    `Analizza il documento "${documentName}" ed estrai ogni prestazione/esame come UN path foglia compatto.\n` +
    `NON generare antenati, prefissi o alberi — solo path foglia completi.\n` +
    `NON generare domande ne grammatiche.\n\nDOCUMENTO:\n${documentText.slice(0, DOCUMENT_TEXT_MAX)}`
  );
}

export function buildRefineTaxonomyUserMessage(
  existingSlots: string[],
  refinementNotes: string,
): string {
  const leafPaths = extractLeafPaths(existingSlots);
  return (
    `Modifica i path foglia compatti secondo le note. NON rileggere alcun documento.\n` +
    `NON generare antenati — solo path foglia completi.\n\n` +
    `PATH FOGLIA ATTUALI (${leafPaths.length}):\n${leafPaths.map((p) => `- ${p}`).join('\n')}\n\n` +
    `NOTE DI AFFINAMENTO:\n${refinementNotes.trim()}`
  );
}

export function buildGenerateAgentUserMessage(
  slots: string[],
  documentName: string,
  documentText?: string,
  correction = '',
): string {
  const docSection = documentText?.trim()
    ? `\n\nCONTESTO DOCUMENTO:\n${documentText.trim().slice(0, DOCUMENT_TEXT_MAX)}`
    : '';

  return (
    `Genera domande, grammatiche e re-prompt per questa tassonomia approvata.\n` +
    `Documento: "${documentName}"\n\n` +
    `STRUTTURA (${slots.length} slot — NON modificare i path):\n${formatSlotTree(slots)}\n\n` +
    formatInternalNodesSection(slots) +
    docSection +
    correction
  );
}

export function buildRegenSubtreeUserMessage(
  slots: string[],
  rootSlot: string,
  documentName: string,
  documentText?: string,
  correction = '',
): string {
  const docSection = documentText?.trim()
    ? `\n\nCONTESTO DOCUMENTO (per formulare domande e sinonimi pertinenti):\n${documentText.trim().slice(0, DOCUMENT_TEXT_MAX)}`
    : '';

  return (
    `Rigenera domande, grammatiche e re-prompt per questa struttura di slot esistente.\n` +
    `Documento: "${documentName}"\n` +
    `Nodo radice del sottoalbero: "${rootSlot}"\n\n` +
    `STRUTTURA GERARCHICA (${slots.length} slot — NON modificare i path, spazi inclusi):\n${formatSlotTree(slots)}\n\n` +
    formatInternalNodesSection(slots) +
    docSection +
    correction
  );
}

export function buildAgentCorrectionMessage(lastError: string): string {
  return `\n\nCORREZIONE: tentativo precedente fallito (${lastError}). Rigenera TUTTI i nodi interni con question, grammar e no_match completi.`;
}

export function buildRegenCorrectionMessage(lastError: string): string {
  return (
    `\n\nCORREZIONE OBBLIGATORIA: il tentativo precedente e' fallito (${lastError}). ` +
    `Rigenera TUTTI i nodi interni elencati sopra con question, grammar (regex+mappings) e no_match_1/2/3. ` +
    `I valori slot_filling devono essere IDENTICI ai path forniti (es. "prima visita" con lo spazio, non "prima_visita").`
  );
}

export function buildRegenMessagesSubtreeUserMessage(
  slots: string[],
  rootSlot: string,
  documentName: string,
  documentText?: string,
  correction = '',
): string {
  const docSection = documentText?.trim()
    ? `\n\nCONTESTO DOCUMENTO:\n${documentText.trim().slice(0, DOCUMENT_TEXT_MAX)}`
    : '';

  return (
    `Rigenera SOLO domande e re-prompt per questa struttura. NON generare grammatiche.\n` +
    `Documento: "${documentName}"\n` +
    `Nodo radice del sottoalbero: "${rootSlot}"\n\n` +
    `STRUTTURA GERARCHICA (${slots.length} slot — NON modificare i path):\n${formatSlotTree(slots)}\n\n` +
    formatMessagesNodesSection(slots) +
    docSection +
    correction
  );
}

export function buildRegenGrammarsSubtreeUserMessage(
  targetSlots: string[],
  rootSlot: string,
  rows: AnalysisRow[],
  documentName: string,
  documentText?: string,
  incremental = true,
  correction = '',
): string {
  const scopeLine = incremental
    ? `Genera grammatiche SOLO per i ${targetSlots.length} nodi elencati (gli altri sono già completi).`
    : `Rigenera grammatiche per TUTTI i ${targetSlots.length} nodi elencati (sovrascrivi le esistenti).`;

  const allSlots = rows.map((r) => r.slot_filling);

  return (
    `${scopeLine}\n` +
    `NON modificare domande ne re-prompt.\n` +
    `Documento: "${documentName}"\n` +
    `Nodo radice del sottoalbero: "${rootSlot}"\n\n` +
    `CONTESTO ALBERO (non generare nodi non elencati sotto):\n${formatSlotTree(allSlots.filter((s) => s === rootSlot || s.startsWith(`${rootSlot}.`)))}\n\n` +
    formatGrammarsNodesSection(targetSlots, rows) +
    correction
  );
}

export function buildMessagesCorrectionMessage(lastError: string): string {
  return (
    `\n\nCORREZIONE OBBLIGATORIA: tentativo precedente fallito (${lastError}). ` +
    `Rigenera TUTTI i nodi interni con question e no_match_1/2/3 completi. grammar deve essere null. ` +
    `Formato JSON: { "rows": [ { "slot_filling": "path.esatto", ... } ] } — NON usare { "tac": { ... } }.`
  );
}

export function buildGrammarsCorrectionMessage(lastError: string): string {
  const missingHint = lastError.includes('Slot mancante')
    ? ' Includi TUTTI gli slot richiesti con slot_filling IDENTICO (trattini inclusi: copia esatto dal prompt).'
    : '';
  return (
    `\n\nCORREZIONE OBBLIGATORIA: tentativo precedente fallito (${lastError}). ` +
    `Rigenera grammatiche per OGNI nodo elencato.${missingHint} ` +
    `mappings deve puntare al path del nodo stesso. question e no_match null. ` +
    `Formato JSON: { "rows": [ { "slot_filling": "path.esatto", "grammar": { "regex": "...", "mappings": {...} } } ] } ` +
    `— NON usare { "grammar": { "slot": ... } }.`
  );
}
