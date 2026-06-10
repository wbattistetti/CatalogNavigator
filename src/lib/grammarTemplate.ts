/**
 * Rule-based grammar generation: recognition grammars live on tokens;
 * answer grammars stay on interactive tree nodes.
 */
import type { AnalysisRow, GrammarEntry } from '../hooks/useAnalysis';
import { validateGrammarRegex } from './grammarNormalize';
import {
  buildInteractivePanels,
  compileInteractiveGrammar,
  seedDefaultPanels,
} from './grammarSynonyms';
import { resolveItemPaths } from './itemPaths';
import { requiresInteractiveNode } from './nluQuestionRules';
import {
  applyTemplateGrammarsToTokens,
  syncRowGrammarsFromTokens,
} from './tokenGrammar';
import type { TokenEntry } from './tokenDictionary';

function isAnswerGrammarComplete(row: AnalysisRow): boolean {
  return !!(
    row.answer_grammar?.regex?.trim()
    && row.answer_grammar.mappings
    && Object.keys(row.answer_grammar.mappings).length > 0
  );
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

function applyAnswerGrammarToRow(
  row: AnalysisRow,
  slots: string[],
  itemPaths: string[],
  overwriteExisting: boolean,
): AnalysisRow {
  if (!shouldReplaceAnswerGrammar(row, slots, itemPaths, overwriteExisting)) {
    if (!requiresInteractiveNode(slots, row.slot_filling, itemPaths)) {
      return { ...row, answer_grammar: null };
    }
    return row;
  }
  return {
    ...row,
    answer_grammar: buildAnswerGrammarForSlot(row.slot_filling, slots, itemPaths),
    status: row.status ?? null,
  };
}

/** Applies answer grammars to interactive nodes only. */
export function applyAnswerGrammarsToRows(
  rows: AnalysisRow[],
  overwriteExisting = false,
  itemPathsInput?: string[] | null,
): AnalysisRow[] {
  const slots = rows.map((r) => r.slot_filling);
  const itemPaths = resolveItemPaths(slots, itemPathsInput);
  return rows.map((row) => applyAnswerGrammarToRow(row, slots, itemPaths, overwriteExisting));
}

/**
 * Fills token grammars then syncs rows (recognition) and applies answer grammars (nodes).
 */
export function applyTemplateGrammarsWithTokens(
  rows: AnalysisRow[],
  tokens: TokenEntry[],
  overwriteExisting = false,
  itemPathsInput?: string[] | null,
): { rows: AnalysisRow[]; tokens: TokenEntry[] } {
  const nextTokens = applyTemplateGrammarsToTokens(tokens, overwriteExisting);
  let nextRows = syncRowGrammarsFromTokens(rows, nextTokens);
  nextRows = applyAnswerGrammarsToRows(nextRows, overwriteExisting, itemPathsInput);
  return { rows: nextRows, tokens: nextTokens };
}

/** @deprecated Use applyTemplateGrammarsWithTokens when dictionary is available. */
export function applyTemplateGrammars(
  rows: AnalysisRow[],
  overwriteExisting = false,
  itemPathsInput?: string[] | null,
): AnalysisRow[] {
  return applyAnswerGrammarsToRows(rows, overwriteExisting, itemPathsInput);
}

/** @deprecated Use applyTemplateGrammarsWithTokens when dictionary is available. */
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
    return applyAnswerGrammarToRow(row, slots, itemPaths, overwriteExisting);
  });
}

/** @deprecated Token grammars replace per-slot node templates. */
export function countMissingTemplateGrammars(rows: AnalysisRow[]): number {
  return rows.filter((r) => !r.grammar?.regex?.trim()).length;
}
