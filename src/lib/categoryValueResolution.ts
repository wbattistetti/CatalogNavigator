/**
 * Resolves attributo values per category cardinality and winner override.
 */
import {
  findCategoryByName,
  getCategoryIdForToken,
  normalizeCategoryOrders,
  normalizeCategoryType,
  type TokenCategory,
} from './dictionaryTree';
import { normalizeCategoryCardinality } from './categoryCardinality';
import { normalizeValueList } from './valueSet';

function dedupeValuesPreserveOrder(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const trimmed = raw?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export class CardinalityViolationError extends Error {
  readonly categoryName: string;
  readonly values: string[];

  constructor(categoryName: string, values: readonly string[]) {
    super(
      `Violazione cardinalità in «${categoryName}»: ${values.join(', ')}`,
    );
    this.name = 'CardinalityViolationError';
    this.categoryName = categoryName;
    this.values = [...values];
  }
}

export interface CategoryResolutionViolation {
  categoryName: string;
  values: string[];
}

function categoryForToken(
  tokenText: string,
  categories: TokenCategory[],
): TokenCategory | undefined {
  const ordered = normalizeCategoryOrders(categories);
  const id = getCategoryIdForToken(tokenText, ordered);
  if (!id) return undefined;
  return ordered.find((c) => c.id === id);
}

/**
 * Resolves raw attributo values for one category.
 * Single + winner: keeps winner when present among conflicts.
 * Single without resolvable winner: throws CardinalityViolationError.
 */
export function resolveAttributoValuesForCategory(
  category: Pick<TokenCategory, 'name' | 'type' | 'cardinality' | 'winner' | 'tokenTexts'>,
  rawValues: readonly string[],
): string[] {
  const normalized = normalizeValueList(rawValues);
  if (normalized.length === 0) return [];

  if (normalizeCategoryType(category.type) === 'vincolo') {
    return [normalized[0]!];
  }

  if (normalizeCategoryCardinality(category.cardinality) === 'multi') {
    return normalized;
  }

  if (normalized.length === 1) return normalized;

  const winner = category.winner?.trim();
  if (winner) {
    const winnerKey = winner.toLowerCase();
    const match = normalized.find((v) => v.toLowerCase() === winnerKey);
    if (match) return [match];
  }

  throw new CardinalityViolationError(category.name, normalized);
}

/** Same as resolveAttributoValuesForCategory but returns violation flag instead of throwing. */
export function tryResolveAttributoValuesForCategory(
  category: Pick<TokenCategory, 'name' | 'type' | 'cardinality' | 'winner' | 'tokenTexts'>,
  rawValues: readonly string[],
): { values: string[]; violation: CategoryResolutionViolation | null } {
  try {
    return {
      values: resolveAttributoValuesForCategory(category, rawValues),
      violation: null,
    };
  } catch (err) {
    if (err instanceof CardinalityViolationError) {
      return {
        values: dedupeValuesPreserveOrder(rawValues),
        violation: { categoryName: err.categoryName, values: err.values },
      };
    }
    throw err;
  }
}

/**
 * Collapses segment texts for single-cardinality categories (winner override when configured).
 * Uncategorized tokens pass through unchanged.
 */
export function applyCategoryResolutionToSegmentTexts(
  segmentTexts: readonly string[],
  categories: TokenCategory[],
): { segments: string[]; violations: CategoryResolutionViolation[] } {
  if (segmentTexts.length === 0) {
    return { segments: [], violations: [] };
  }

  const ordered = normalizeCategoryOrders(categories);
  const violations: CategoryResolutionViolation[] = [];
  const resolved: string[] = [];

  let index = 0;
  while (index < segmentTexts.length) {
    const text = segmentTexts[index]!;
    const category = categoryForToken(text, ordered);

    if (!category) {
      resolved.push(text);
      index += 1;
      continue;
    }

    const group: string[] = [text];
    index += 1;
    while (index < segmentTexts.length) {
      const next = segmentTexts[index]!;
      const nextCategory = categoryForToken(next, ordered);
      if (nextCategory?.id !== category.id) break;
      group.push(next);
      index += 1;
    }

    const { values, violation } = tryResolveAttributoValuesForCategory(category, group);
    if (violation) violations.push(violation);
    resolved.push(...values);
  }

  return { segments: resolved, violations };
}

/** Detects unresolved single-cardinality conflicts on compiled corpus segments. */
export function findCardinalityViolationsForSegments(
  segments: ReadonlyArray<{ text: string; categoryName: string; categoryType?: string }>,
  categories: TokenCategory[],
): CategoryResolutionViolation[] {
  const grouped = new Map<string, string[]>();
  for (const seg of segments) {
    if (!seg.text?.trim() || !seg.categoryName?.trim()) continue;
    if (seg.categoryType === 'vincolo') continue;
    const key = seg.categoryName.trim();
    const list = grouped.get(key) ?? [];
    list.push(seg.text.trim());
    grouped.set(key, list);
  }

  const violations: CategoryResolutionViolation[] = [];
  for (const [categoryName, values] of grouped) {
    const category = findCategoryByName(categories, categoryName);
    if (!category) continue;
    const { violation } = tryResolveAttributoValuesForCategory(category, values);
    if (violation) violations.push(violation);
  }
  return violations;
}
