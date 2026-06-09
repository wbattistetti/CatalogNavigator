/**
 * Post-processes raw OpenAI JSON into validated analysis rows.
 */
import type { AnalysisRow } from '../hooks/useAnalysis';
import {
  expandLeafPathsToTree,
  isLeafSlot,
  normalizeSlotKey,
  normalizeSlotPathFromAi,
  orderSlotsDepthFirst,
} from './analysisTree';
import {
  normalizeGrammarEntry,
  normalizeGrammarRegex,
} from './grammarNormalize';
import {
  applyNluQuestionRules,
  isPassthroughNode,
  requiresInteractiveNode,
} from './nluQuestionRules';

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

function validateInternalNode(slots: string[], slot: string, row: AnalysisRow): void {
  if (!requiresInteractiveNode(slots, slot)) return;
  if (!row.question?.trim()) throw new Error(`Domanda mancante per nodo interno: ${slot}`);
  if (!row.grammar?.regex?.trim()) throw new Error(`Grammatica mancante per nodo interno: ${slot}`);
  if (!row.grammar.mappings || Object.keys(row.grammar.mappings).length === 0) {
    throw new Error(`Mappings mancanti per nodo interno: ${slot}`);
  }
  if (!row.no_match_1?.trim() || !row.no_match_2?.trim() || !row.no_match_3?.trim()) {
    throw new Error(`Re-prompt mancanti per nodo interno: ${slot}`);
  }
}

function validateMessagesInternalNode(slots: string[], slot: string, row: AnalysisRow): void {
  if (!requiresInteractiveNode(slots, slot)) return;
  if (!row.question?.trim()) throw new Error(`Domanda mancante per nodo interno: ${slot}`);
  if (!row.no_match_1?.trim() || !row.no_match_2?.trim() || !row.no_match_3?.trim()) {
    throw new Error(`Re-prompt mancanti per nodo interno: ${slot}`);
  }
}

function validateGrammarNode(slot: string, row: AnalysisRow): void {
  if (!row.grammar?.regex?.trim()) throw new Error(`Grammatica mancante per nodo: ${slot}`);
  if (!row.grammar.mappings || Object.keys(row.grammar.mappings).length === 0) {
    throw new Error(`Mappings mancanti per nodo: ${slot}`);
  }
}

/** Forces grammar mappings to point to the node's own slot path (parallel longest-match model). */
export function ensureGrammarMapsToSelf(row: AnalysisRow): AnalysisRow {
  if (!row.grammar?.regex?.trim()) return row;
  const mappings: Record<string, string> = {};
  for (const key of Object.keys(row.grammar.mappings)) {
    mappings[key] = row.slot_filling;
  }
  if (Object.keys(mappings).length === 0) {
    mappings.nodo = row.slot_filling;
  }
  return {
    ...row,
    grammar: normalizeGrammarEntry({ regex: row.grammar.regex, mappings }),
  };
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

function indexAiRows(aiRows: AnalysisRow[]): {
  byExact: Map<string, AnalysisRow>;
  byNormalized: Map<string, AnalysisRow>;
} {
  const byExact = new Map<string, AnalysisRow>();
  const byNormalized = new Map<string, AnalysisRow>();
  for (const row of aiRows) {
    byExact.set(row.slot_filling, row);
    const keys = new Set([
      normalizeSlotKey(row.slot_filling),
      normalizeSlotKey(normalizeSlotPathFromAi(row.slot_filling)),
    ]);
    for (const key of keys) {
      if (key) byNormalized.set(key, row);
    }
  }
  return { byExact, byNormalized };
}

function matchAiRow(
  slot: string,
  byExact: Map<string, AnalysisRow>,
  byNormalized: Map<string, AnalysisRow>,
): AnalysisRow | undefined {
  return (
    byExact.get(slot)
    ?? byNormalized.get(normalizeSlotKey(slot))
    ?? byNormalized.get(normalizeSlotKey(normalizeSlotPathFromAi(slot)))
  );
}

/** Maps AI rows onto the exact input slots. Throws if any slot or required field is missing. */
export function assembleRegenRows(slots: string[], aiRows: AnalysisRow[]): AnalysisRow[] {
  const { byExact, byNormalized } = indexAiRows(aiRows);

  return slots.map((slot) => {
    const matched = matchAiRow(slot, byExact, byNormalized);
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

    validateInternalNode(slots, slot, matched);
    return { ...matched, slot_filling: slot, status: null };
  });
}

/** Normalizes regex escape sequences in grammar fields. */
export function normalizeGrammarRows(rows: AnalysisRow[]): AnalysisRow[] {
  return rows.map((row) => {
    if (!row.grammar?.regex) return row;
    return { ...row, grammar: normalizeGrammarEntry(row.grammar) };
  });
}

export { normalizeGrammarRegex };

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

/** Maps AI rows onto input slots for messages-only generation. */
export function assembleMessagesRows(slots: string[], aiRows: AnalysisRow[]): AnalysisRow[] {
  const { byExact, byNormalized } = indexAiRows(aiRows);

  return slots.map((slot) => {
    const matched = matchAiRow(slot, byExact, byNormalized);
    if (!matched) throw new Error(`Slot mancante nella risposta AI: ${slot}`);

    if (isLeafSlot(slots, slot) || isPassthroughNode(slots, slot)) {
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

    validateMessagesInternalNode(slots, slot, matched);
    return {
      slot_filling: slot,
      question: matched.question,
      grammar: null,
      no_match_1: matched.no_match_1,
      no_match_2: matched.no_match_2,
      no_match_3: matched.no_match_3,
      confirmation_text: matched.confirmation_text ?? null,
      status: null,
    };
  });
}

/** Maps AI rows onto input slots for grammars-only generation. */
export function assembleGrammarRows(slots: string[], aiRows: AnalysisRow[]): AnalysisRow[] {
  const { byExact, byNormalized } = indexAiRows(aiRows);

  return slots.map((slot) => {
    const matched = matchAiRow(slot, byExact, byNormalized);
    if (!matched) throw new Error(`Slot mancante nella risposta AI: ${slot}`);

    validateGrammarNode(slot, matched);
    return ensureGrammarMapsToSelf({
      slot_filling: slot,
      question: null,
      grammar: matched.grammar,
      no_match_1: null,
      no_match_2: null,
      no_match_3: null,
      confirmation_text: matched.confirmation_text ?? null,
      status: null,
    });
  });
}

/** Processes agent/regen AI response into validated NLU rows. */
export function processNluAiResponse(slots: string[], rawRows: unknown[]): AnalysisRow[] {
  const aiRows = rawRows
    .map((r) => normalizeAiRow(r as Record<string, unknown>))
    .filter((r): r is AnalysisRow => r !== null);

  const assembled = normalizeGrammarRows(assembleRegenRows(slots, aiRows));
  return applyNluQuestionRules(slots, assembled);
}

/** Processes messages-only AI response. */
export function processMessagesAiResponse(slots: string[], rawRows: unknown[]): AnalysisRow[] {
  const aiRows = rawRows
    .map((r) => normalizeAiRow(r as Record<string, unknown>))
    .filter((r): r is AnalysisRow => r !== null);

  const assembled = assembleMessagesRows(slots, aiRows);
  return applyNluQuestionRules(slots, assembled);
}

/** Processes grammars-only AI response. */
export function processGrammarsAiResponse(slots: string[], rawRows: unknown[]): AnalysisRow[] {
  const aiRows = rawRows
    .map((r) => normalizeAiRow(r as Record<string, unknown>))
    .filter((r): r is AnalysisRow => r !== null);

  const assembled = assembleGrammarRows(slots, aiRows);
  return normalizeGrammarRows(assembled.map(ensureGrammarMapsToSelf));
}
