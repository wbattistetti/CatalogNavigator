/**
 * Load dictionary category tokens from distinct values in a tabular document column.
 */
import type { ColumnRole } from './supabase';
import type { ParsedTabular } from './parseTabular';
import type { TokenCategory } from './dictionaryTree';
import { NO_CATEGORY_SENTINEL } from './dictionaryTree';
import { applyNewConceptLine } from './tokenConceptEditor';
import { selectionToTokenPhrase, type TokenEntry } from './tokenDictionary';

/** Ask for confirmation when importing more than this many distinct values. */
export const LOAD_FROM_COLUMN_CONFIRM_THRESHOLD = 100;

/** Column headers eligible for category import (non-tabular docs yield []). */
export function importableDocumentColumns(
  headers: string[],
  columnRoles: Record<string, ColumnRole> = {},
): string[] {
  return headers.filter((h) => columnRoles[h] !== 'ignore');
}

/** True when tabular data exists and at least one importable column is configured. */
export function canLoadCategoryFromDocument(
  tabular: ParsedTabular | null | undefined,
  columnRoles: Record<string, ColumnRole> = {},
): boolean {
  if (!tabular || tabular.headers.length === 0 || tabular.rows.length === 0) return false;
  return importableDocumentColumns(tabular.headers, columnRoles).length > 0;
}

/** Distinct non-empty cell values in one column, normalized like manual token entry. */
export function extractDistinctColumnValues(
  tabular: ParsedTabular,
  columnName: string,
): string[] {
  const colIdx = tabular.headers.indexOf(columnName);
  if (colIdx < 0) return [];

  const seen = new Set<string>();
  const values: string[] = [];

  for (const row of tabular.rows) {
    const raw = String(row[colIdx] ?? '').trim();
    if (!raw) continue;
    const normalized = selectionToTokenPhrase(raw);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    values.push(normalized);
  }

  return values.sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));
}

export interface LoadTokensFromColumnResult {
  tokens: TokenEntry[];
  categories: TokenCategory[];
  importedCount: number;
  skippedDuplicateInCategory: number;
}

/**
 * Adds each column value as a canonical token in the target category.
 * Reuses applyNewConceptLine so existing tokens move from other categories.
 */
export function loadTokensFromColumnIntoCategory(
  tokens: TokenEntry[],
  categories: TokenCategory[],
  categoryKey: string,
  values: string[],
): LoadTokensFromColumnResult {
  if (categoryKey === NO_CATEGORY_SENTINEL) {
    throw new Error('Cannot load column values into "no category"');
  }
  if (values.length === 0) {
    return { tokens, categories, importedCount: 0, skippedDuplicateInCategory: 0 };
  }

  let nextTokens = tokens;
  let nextCategories = categories;
  let importedCount = 0;
  let skippedDuplicateInCategory = 0;

  for (const value of values) {
    try {
      const result = applyNewConceptLine(nextTokens, nextCategories, categoryKey, value);
      nextTokens = result.tokens;
      nextCategories = result.categories;
      importedCount += 1;
    } catch {
      skippedDuplicateInCategory += 1;
    }
  }

  return {
    tokens: nextTokens,
    categories: nextCategories,
    importedCount,
    skippedDuplicateInCategory,
  };
}
