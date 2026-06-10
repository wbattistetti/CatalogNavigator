/**
 * Post-processes raw OpenAI JSON into validated analysis rows.
 */
import type { AnalysisRow } from '../hooks/useAnalysis';
import {
  expandLeafPathsToTree,
  getRowBySlot,
  indexRowsBySlot,
  normalizeSlotKey,
  normalizeSlotPathFromAi,
  orderSlotsDepthFirst,
} from './analysisTree';
import { isTerminalItemSlot, normalizeItemPaths, resolveItemPaths } from './itemPaths';
import {
  normalizeGrammarEntry,
  normalizeGrammarRegex,
} from './grammarNormalize';
import {
  buildMessageFreeRow,
  buildInteractiveMessageFallback,
  ensureInteractiveNoMatch,
  isMessageFreeSlot,
} from './messageAssembly';
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
    answer_grammar: null,
    no_match_1: null,
    no_match_2: null,
    no_match_3: null,
    confirmation_text: null,
    status: null,
  }));
}

function validateInternalNode(
  slots: string[],
  slot: string,
  row: AnalysisRow,
  itemPathsInput?: string[] | null,
): void {
  if (!requiresInteractiveNode(slots, slot, itemPathsInput)) return;
  if (!row.question?.trim()) throw new Error(`Domanda mancante per nodo interno: ${slot}`);
  if (!row.grammar?.regex?.trim()) throw new Error(`Grammatica mancante per nodo interno: ${slot}`);
  if (!row.grammar.mappings || Object.keys(row.grammar.mappings).length === 0) {
    throw new Error(`Mappings mancanti per nodo interno: ${slot}`);
  }
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
  const answerRaw = (raw.answer_grammar ?? raw.answerGrammar) as
    { regex?: string; mappings?: Record<string, string> } | null | undefined;
  const answer_grammar = answerRaw?.regex
    ? { regex: answerRaw.regex, mappings: answerRaw.mappings ?? {} }
    : null;

  return {
    slot_filling: slot.trim(),
    question: str(raw.question ?? raw.domanda),
    grammar,
    answer_grammar,
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

function isMessageFreeNode(slots: string[], slot: string, itemPathsInput?: string[] | null): boolean {
  const itemPaths = resolveItemPaths(slots, itemPathsInput);
  return isPassthroughNode(slots, slot, itemPaths) || isTerminalItemSlot(slot, itemPaths);
}

/** Maps AI rows onto the exact input slots. Throws if any slot or required field is missing. */
export function assembleRegenRows(
  slots: string[],
  aiRows: AnalysisRow[],
  itemPathsInput?: string[] | null,
): AnalysisRow[] {
  const { byExact, byNormalized } = indexAiRows(aiRows);

  return slots.map((slot) => {
    const matched = matchAiRow(slot, byExact, byNormalized);
    if (!matched) throw new Error(`Slot mancante nella risposta AI: ${slot}`);

    if (isMessageFreeNode(slots, slot, itemPathsInput)) {
      return {
        slot_filling: slot,
        question: null,
        grammar: null,
        answer_grammar: null,
        no_match_1: null,
        no_match_2: null,
        no_match_3: null,
        confirmation_text: matched.confirmation_text ?? null,
        status: null,
      };
    }

    validateInternalNode(slots, slot, matched, itemPathsInput);
    return { ...matched, slot_filling: slot, status: null };
  });
}

/** Normalizes regex escape sequences in grammar fields. */
export function normalizeGrammarRows(rows: AnalysisRow[]): AnalysisRow[] {
  return rows.map((row) => {
    let next = { ...row, answer_grammar: row.answer_grammar ?? null };
    if (next.grammar?.regex) {
      next = { ...next, grammar: normalizeGrammarEntry(next.grammar) };
    }
    if (next.answer_grammar?.regex) {
      next = { ...next, answer_grammar: normalizeGrammarEntry(next.answer_grammar) };
    }
    return next;
  });
}

export { normalizeGrammarRegex };

/**
 * Processes taxonomy AI response: extracts compact leaf paths from AI,
 * then expands ancestors deterministically in code.
 */
export interface TaxonomyBuildResult {
  rows: AnalysisRow[];
  item_paths: string[];
}

/** Builds tree rows and corpus item paths from compact catalog leaf paths. */
export function buildTaxonomyFromItemPaths(itemPathInputs: string[]): TaxonomyBuildResult {
  const item_paths = normalizeItemPaths(itemPathInputs);
  if (item_paths.length === 0) throw new Error('Nessun path item');
  const allSlots = expandLeafPathsToTree(item_paths);
  if (allSlots.length === 0) throw new Error('Espansione albero fallita');
  return { rows: toTaxonomyRows(allSlots), item_paths };
}

export function processTaxonomyAiResponse(rawRows: unknown[]): TaxonomyBuildResult {
  const leafPaths = extractSlotsFromAiRows(rawRows);
  if (leafPaths.length === 0) throw new Error('Nessun path foglia estratto dal documento');
  return buildTaxonomyFromItemPaths(leafPaths);
}

/**
 * Builds one row per slot deterministically.
 * AI rows (optional) enrich interactive paths only; missing slots never throw.
 */
export function assembleMessagesRows(
  slots: string[],
  aiRows: AnalysisRow[],
  itemPathsInput?: string[] | null,
): AnalysisRow[] {
  const { byExact, byNormalized } = indexAiRows(aiRows);

  return slots.map((slot) => {
    if (isMessageFreeSlot(slots, slot, itemPathsInput)) {
      return buildMessageFreeRow(slot);
    }

    const matched = matchAiRow(slot, byExact, byNormalized);
    const fallback = buildInteractiveMessageFallback(slots, slot, itemPathsInput);

    const row = ensureInteractiveNoMatch({
      slot_filling: slot,
      question: matched?.question?.trim() || fallback.question,
      grammar: null,
      answer_grammar: null,
      no_match_1: matched?.no_match_1?.trim() || fallback.no_match_1,
      no_match_2: matched?.no_match_2?.trim() || fallback.no_match_2,
      no_match_3: matched?.no_match_3?.trim() || fallback.no_match_3,
      confirmation_text: matched?.confirmation_text ?? null,
      status: null,
    });

    return row;
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
      answer_grammar: null,
      no_match_1: null,
      no_match_2: null,
      no_match_3: null,
      confirmation_text: matched.confirmation_text ?? null,
      status: null,
    });
  });
}

/** Processes agent/regen AI response into validated NLU rows. */
export function processNluAiResponse(
  slots: string[],
  rawRows: unknown[],
  itemPathsInput?: string[] | null,
): AnalysisRow[] {
  const aiRows = rawRows
    .map((r) => normalizeAiRow(r as Record<string, unknown>))
    .filter((r): r is AnalysisRow => r !== null);

  const assembled = normalizeGrammarRows(assembleRegenRows(slots, aiRows, itemPathsInput));
  return applyNluQuestionRules(slots, assembled, itemPathsInput);
}

/**
 * Applies algorithmic questions/no_match to existing rows (preserves grammars).
 * Always runs before optional AI enrichment so every interactive slot is linked.
 */
export function applyDeterministicMessagesLayer(
  rows: AnalysisRow[],
  itemPathsInput?: string[] | null,
): AnalysisRow[] {
  const slots = rows.map((r) => r.slot_filling);
  const messages = processMessagesAiResponse(slots, [], itemPathsInput);
  const bySlot = indexRowsBySlot(messages);
  return rows.map((row) => {
    const msg = getRowBySlot(bySlot, row.slot_filling);
    if (!msg) return row;
    return {
      ...row,
      question: msg.question,
      no_match_1: msg.no_match_1,
      no_match_2: msg.no_match_2,
      no_match_3: msg.no_match_3,
    };
  });
}

/** Processes messages-only AI response. */
export function processMessagesAiResponse(
  slots: string[],
  rawRows: unknown[],
  itemPathsInput?: string[] | null,
): AnalysisRow[] {
  const aiRows = rawRows
    .map((r) => normalizeAiRow(r as Record<string, unknown>))
    .filter((r): r is AnalysisRow => r !== null);

  const assembled = assembleMessagesRows(slots, aiRows, itemPathsInput);
  return applyNluQuestionRules(slots, assembled, itemPathsInput);
}

/** Processes grammars-only AI response. */
export function processGrammarsAiResponse(slots: string[], rawRows: unknown[]): AnalysisRow[] {
  const aiRows = rawRows
    .map((r) => normalizeAiRow(r as Record<string, unknown>))
    .filter((r): r is AnalysisRow => r !== null);

  const assembled = assembleGrammarRows(slots, aiRows);
  return normalizeGrammarRows(assembled.map(ensureGrammarMapsToSelf));
}
