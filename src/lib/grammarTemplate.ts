/**
 * Rule-based grammar generation: one recognition grammar per dictionary category.
 * Tree node grammars (grammar / answer_grammar) are no longer generated.
 */
import type { AnalysisRow } from '../hooks/useAnalysis';
import type { TokenCategory } from './dictionaryTree';
import { applyCategoryGrammars } from './categoryGrammar';
import type { TokenEntry } from './tokenDictionary';

/** Clears legacy node-level grammars from analysis rows. */
export function clearRowGrammars(rows: AnalysisRow[]): AnalysisRow[] {
  return rows.map((row) => ({
    ...row,
    grammar: null,
    answer_grammar: null,
  }));
}

export interface CategoryGrammarGenerationResult {
  rows: AnalysisRow[];
  tokens: TokenEntry[];
  categories: TokenCategory[];
}

/**
 * Compiles category grammars from token synonym data and clears node grammars.
 */
export function applyCategoryGrammarsWithTokens(
  rows: AnalysisRow[],
  tokens: TokenEntry[],
  overwriteExisting = false,
  _itemPathsInput?: string[] | null,
  categories?: TokenCategory[],
): CategoryGrammarGenerationResult {
  const nextCategories = applyCategoryGrammars(categories ?? [], tokens, overwriteExisting);
  return {
    rows: clearRowGrammars(rows),
    tokens,
    categories: nextCategories,
  };
}

/** @deprecated Use applyCategoryGrammarsWithTokens. */
export function applyTemplateGrammarsWithTokens(
  rows: AnalysisRow[],
  tokens: TokenEntry[],
  overwriteExisting = false,
  itemPathsInput?: string[] | null,
  categories?: TokenCategory[],
): { rows: AnalysisRow[]; tokens: TokenEntry[] } {
  const result = applyCategoryGrammarsWithTokens(
    rows, tokens, overwriteExisting, itemPathsInput, categories,
  );
  return { rows: result.rows, tokens: result.tokens };
}

/** @deprecated Category grammars replace per-node answer grammars. */
export function applyAnswerGrammarsToRows(
  rows: AnalysisRow[],
  _overwriteExisting = false,
  _itemPathsInput?: string[] | null,
  _categories?: TokenCategory[],
): AnalysisRow[] {
  return clearRowGrammars(rows);
}

/** @deprecated Use applyCategoryGrammarsWithTokens. */
export function applyTemplateGrammars(
  rows: AnalysisRow[],
  overwriteExisting = false,
  itemPathsInput?: string[] | null,
  categories?: TokenCategory[],
): AnalysisRow[] {
  return applyCategoryGrammarsWithTokens(rows, [], overwriteExisting, itemPathsInput, categories).rows;
}

/** @deprecated Use applyCategoryGrammarsWithTokens. */
export function applyTemplateGrammarsToSlots(
  rows: AnalysisRow[],
  targetSlots: string[],
  overwriteExisting = false,
  itemPathsInput?: string[] | null,
  categories?: TokenCategory[],
): AnalysisRow[] {
  const targets = new Set(targetSlots);
  return rows.map((row) => {
    if (!targets.has(row.slot_filling)) return row;
    return { ...row, grammar: null, answer_grammar: null };
  });
}

/** @deprecated Use findCategoriesMissingGrammar from categoryGrammar. */
export function countMissingTemplateGrammars(rows: AnalysisRow[]): number {
  return rows.filter((r) => r.grammar?.regex?.trim()).length;
}
