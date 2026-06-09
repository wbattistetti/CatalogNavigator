/**
 * Rule-based grammar generation from slot paths — instant, no API calls.
 * Node grammar maps to self; answer grammar maps to children on interactive nodes.
 */
import type { AnalysisRow, GrammarEntry } from '../hooks/useAnalysis';
import { validateGrammarRegex } from './grammarNormalize';
import {
  buildInteractivePanels,
  compileInteractiveGrammar,
  compileSimpleGrammar,
  defaultSynonymsForSlot,
  seedDefaultPanels,
} from './grammarSynonyms';
import { resolveItemPaths } from './itemPaths';
import { requiresInteractiveNode } from './nluQuestionRules';

function isNodeGrammarComplete(row: AnalysisRow): boolean {
  return !!(
    row.grammar?.regex?.trim()
    && row.grammar.mappings
    && Object.keys(row.grammar.mappings).length > 0
  );
}

function isAnswerGrammarComplete(row: AnalysisRow): boolean {
  return !!(
    row.answer_grammar?.regex?.trim()
    && row.answer_grammar.mappings
    && Object.keys(row.answer_grammar.mappings).length > 0
  );
}

function buildNodeGrammarForSlot(slot: string): GrammarEntry {
  return compileSimpleGrammar(slot, defaultSynonymsForSlot(slot));
}

function buildAnswerGrammarForSlot(
  slot: string,
  slots: string[],
  itemPaths: string[],
): GrammarEntry | null {
  if (!requiresInteractiveNode(slots, slot, itemPaths)) return null;
  let panels = buildInteractivePanels(slot, slots, itemPaths);
  panels = seedDefaultPanels(panels, slot);
  return compileInteractiveGrammar(panels);
}

function shouldReplaceNodeGrammar(row: AnalysisRow, overwriteExisting: boolean): boolean {
  if (overwriteExisting) return true;
  if (!isNodeGrammarComplete(row)) return true;
  const validation = validateGrammarRegex(row.grammar!.regex, row.grammar!.mappings);
  return !validation.valid;
}

function shouldReplaceAnswerGrammar(
  row: AnalysisRow,
  slots: string[],
  itemPaths: string[],
  overwriteExisting: boolean,
): boolean {
  if (!requiresInteractiveNode(slots, row.slot_filling, itemPaths)) return false;
  if (overwriteExisting) return true;
  if (!isAnswerGrammarComplete(row)) return true;
  const validation = validateGrammarRegex(
    row.answer_grammar!.regex,
    row.answer_grammar!.mappings,
  );
  return !validation.valid;
}

function applyTemplateToRow(
  row: AnalysisRow,
  slots: string[],
  itemPaths: string[],
  overwriteExisting: boolean,
): AnalysisRow {
  let next = row;
  if (shouldReplaceNodeGrammar(row, overwriteExisting)) {
    next = { ...next, grammar: buildNodeGrammarForSlot(row.slot_filling) };
  }
  if (shouldReplaceAnswerGrammar(row, slots, itemPaths, overwriteExisting)) {
    next = {
      ...next,
      answer_grammar: buildAnswerGrammarForSlot(row.slot_filling, slots, itemPaths),
    };
  } else if (!requiresInteractiveNode(slots, row.slot_filling, itemPaths)) {
    next = { ...next, answer_grammar: null };
  }
  return { ...next, status: row.status ?? null };
}

/**
 * Applies template grammars to rows (incremental or full overwrite).
 * Returns new rows array with grammars filled.
 */
export function applyTemplateGrammars(
  rows: AnalysisRow[],
  overwriteExisting = false,
  itemPathsInput?: string[] | null,
): AnalysisRow[] {
  const slots = rows.map((r) => r.slot_filling);
  const itemPaths = resolveItemPaths(slots, itemPathsInput);
  return rows.map((row) => applyTemplateToRow(row, slots, itemPaths, overwriteExisting));
}

/** True when every row has a template-applicable grammar slot. */
export function countMissingTemplateGrammars(rows: AnalysisRow[]): number {
  return rows.filter((r) => !isNodeGrammarComplete(r)).length;
}

/** Applies templates only to rows whose slot is in targetSlots. */
export function applyTemplateGrammarsToSlots(
  rows: AnalysisRow[],
  targetSlots: string[],
  overwriteExisting = false,
  itemPathsInput?: string[] | null,
): AnalysisRow[] {
  const slots = rows.map((r) => r.slot_filling);
  const itemPaths = resolveItemPaths(slots, itemPathsInput);
  const targets = new Set(targetSlots);
  return rows.map((row) => {
    if (!targets.has(row.slot_filling)) return row;
    return applyTemplateToRow(row, slots, itemPaths, overwriteExisting);
  });
}

/** @deprecated Use compileSimpleGrammar from grammarSynonyms. */
export function buildTemplateGrammar(slot: string): GrammarEntry {
  return compileSimpleGrammar(slot, defaultSynonymsForSlot(slot));
}

/** @deprecated Use compileInteractiveGrammar from grammarSynonyms. */
export function buildPrefixDisambiguationGrammar(
  parentSlot: string,
  childItemSlots: string[],
): GrammarEntry {
  const slots = [parentSlot, ...childItemSlots];
  const itemPaths = resolveItemPaths(slots, [parentSlot, ...childItemSlots]);
  let panels = buildInteractivePanels(parentSlot, slots, itemPaths);
  panels = seedDefaultPanels(panels, parentSlot);
  return compileInteractiveGrammar(panels);
}
