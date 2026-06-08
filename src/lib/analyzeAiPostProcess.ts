/**
 * Post-processes raw OpenAI JSON into validated analysis rows.
 */
import type { AnalysisRow } from '../hooks/useAnalysis';
import { expandLeafPathsToTree, isLeafSlot, orderSlotsDepthFirst } from './analysisTree';

/** Extracts unique slot paths from raw AI row objects. */
export function extractSlotsFromAiRows(rows: unknown[]): string[] {
  const slots: string[] = [];
  for (const raw of rows) {
    const row = raw as Record<string, unknown>;
    const slot = row.slot_filling ?? row.slot ?? row.path;
    if (typeof slot === 'string' && slot.trim()) slots.push(slot.trim());
  }
  return [...new Set(slots)];
}

/** Converts slot paths to taxonomy-only rows (no NLU fields). */
export function toTaxonomyRows(slots: string[]): AnalysisRow[] {
  return orderSlotsDepthFirst(slots).map((slot_filling) => ({
    slot_filling,
    question: null,
    grammar: null,
    no_match_1: null,
    no_match_2: null,
    no_match_3: null,
    confirmation_text: null,
    status: null,
  }));
}

function validateInternalNode(slot: string, row: AnalysisRow): void {
  if (!row.question?.trim()) throw new Error(`Domanda mancante per nodo interno: ${slot}`);
  if (!row.grammar?.regex?.trim()) throw new Error(`Grammatica mancante per nodo interno: ${slot}`);
  if (!row.grammar.mappings || Object.keys(row.grammar.mappings).length === 0) {
    throw new Error(`Mappings mancanti per nodo interno: ${slot}`);
  }
  if (!row.no_match_1?.trim() || !row.no_match_2?.trim() || !row.no_match_3?.trim()) {
    throw new Error(`Re-prompt mancanti per nodo interno: ${slot}`);
  }
}

/** Normalizes a raw AI row object, tolerating common field-name mistakes. */
export function normalizeAiRow(raw: Record<string, unknown>): AnalysisRow | null {
  const slot = raw.slot_filling ?? raw.slot ?? raw.path;
  if (typeof slot !== 'string' || !slot.trim()) return null;

  const str = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() ? v.trim() : null;

  const grammarRaw = raw.grammar as { regex?: string; mappings?: Record<string, string> } | null | undefined;
  const grammar = grammarRaw?.regex
    ? { regex: grammarRaw.regex, mappings: grammarRaw.mappings ?? {} }
    : null;

  return {
    slot_filling: slot.trim(),
    question: str(raw.question ?? raw.domanda),
    grammar,
    no_match_1: str(raw.no_match_1 ?? raw.noMatch1),
    no_match_2: str(raw.no_match_2 ?? raw.noMatch2),
    no_match_3: str(raw.no_match_3 ?? raw.noMatch3),
    confirmation_text: str(raw.confirmation_text ?? raw.confirmation),
    status: null,
  };
}

function normalizeSlotKey(slot: string): string {
  return slot.toLowerCase().replace(/_/g, ' ');
}

/** Maps AI rows onto the exact input slots. Throws if any slot or required field is missing. */
export function assembleRegenRows(slots: string[], aiRows: AnalysisRow[]): AnalysisRow[] {
  const byExact = new Map<string, AnalysisRow>();
  const byNormalized = new Map<string, AnalysisRow>();
  for (const row of aiRows) {
    byExact.set(row.slot_filling, row);
    byNormalized.set(normalizeSlotKey(row.slot_filling), row);
  }

  return slots.map((slot) => {
    const matched = byExact.get(slot) ?? byNormalized.get(normalizeSlotKey(slot));
    if (!matched) throw new Error(`Slot mancante nella risposta AI: ${slot}`);

    if (isLeafSlot(slots, slot)) {
      return {
        slot_filling: slot,
        question: null,
        grammar: null,
        no_match_1: null,
        no_match_2: null,
        no_match_3: null,
        confirmation_text: matched.confirmation_text ?? null,
        status: null,
      };
    }

    validateInternalNode(slot, matched);
    return { ...matched, slot_filling: slot, status: null };
  });
}

function normalizeRegexStr(regex: string): string {
  return regex
    .replace(/\\\\([wWdDsSpPhHvVbBnNrRtT])/g, '\\$1')
    .replace(/\(\?P\\([A-Za-z_])/g, '(?P<$1');
}

/** Normalizes regex escape sequences in grammar fields. */
export function normalizeGrammarRows(rows: AnalysisRow[]): AnalysisRow[] {
  return rows.map((row) => {
    if (!row.grammar?.regex) return row;
    return { ...row, grammar: { ...row.grammar, regex: normalizeRegexStr(row.grammar.regex) } };
  });
}

/**
 * Processes taxonomy AI response: extracts compact leaf paths from AI,
 * then expands ancestors deterministically in code.
 */
export function processTaxonomyAiResponse(rawRows: unknown[]): AnalysisRow[] {
  const leafPaths = extractSlotsFromAiRows(rawRows);
  if (leafPaths.length === 0) throw new Error('Nessun path foglia estratto dal documento');
  const allSlots = expandLeafPathsToTree(leafPaths);
  if (allSlots.length === 0) throw new Error('Espansione albero fallita');
  return toTaxonomyRows(allSlots);
}

/** Processes agent/regen AI response into validated NLU rows. */
export function processNluAiResponse(slots: string[], rawRows: unknown[]): AnalysisRow[] {
  const aiRows = rawRows
    .map((r) => normalizeAiRow(r as Record<string, unknown>))
    .filter((r): r is AnalysisRow => r !== null);

  return normalizeGrammarRows(assembleRegenRows(slots, aiRows));
}
