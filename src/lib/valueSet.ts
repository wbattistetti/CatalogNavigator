/**
 * Normalization and comparison for multi-value concept sets (category → values[]).
 */
import { normalizeSlotCategoryKey } from './slotExtract';
import type { BundleCorpusItem } from './agentBundleTypes';

/** Separator for canonical multi-value option keys (inter-option delimiter remains `|`). */
export const VALUE_SET_SEPARATOR = '+';

/** Runtime/catalog sentinel for a category with no values on this item. */
export const MISSING_VALUE_SET_KEY = 'none';

/** Normalizes, deduplicates, and sorts value tokens for stable set identity. */
export function normalizeValueList(values: readonly string[]): string[] {
  const trimmed = values.map((v) => v?.trim()).filter((v): v is string => Boolean(v));
  if (trimmed.length === 1 && trimmed[0] === MISSING_VALUE_SET_KEY) {
    return [MISSING_VALUE_SET_KEY];
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of trimmed) {
    if (raw === MISSING_VALUE_SET_KEY) continue;
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(raw);
  }
  return out.sort((a, b) => a.localeCompare(b, 'it'));
}

/** Builds a canonical key for a value set (single token unchanged; multi joined with `+`). */
export function valueSetKey(values: readonly string[]): string {
  const norm = normalizeValueList(values);
  if (norm.length === 0) return MISSING_VALUE_SET_KEY;
  if (norm.length === 1) return norm[0]!;
  return norm.join(VALUE_SET_SEPARATOR);
}

/** Parses a canonical set key back into sorted normalized values. */
export function parseValueSetKey(key: string): string[] {
  const trimmed = key?.trim();
  if (!trimmed || trimmed === MISSING_VALUE_SET_KEY) return [];
  if (!trimmed.includes(VALUE_SET_SEPARATOR)) return [trimmed];
  return normalizeValueList(trimmed.split(VALUE_SET_SEPARATOR));
}

export function isMissingValueSetKey(key: string): boolean {
  return !key?.trim() || key.trim() === MISSING_VALUE_SET_KEY;
}

export function isMissingValueList(values: readonly string[]): boolean {
  const norm = normalizeValueList(values);
  return norm.length === 0 || (norm.length === 1 && norm[0] === MISSING_VALUE_SET_KEY);
}

export function valueSetsEqual(a: readonly string[], b: readonly string[]): boolean {
  return valueSetKey(a) === valueSetKey(b);
}

/** True when the item set contains every mentioned value (NLU subset match). */
export function valueSetContainsAll(
  itemValues: readonly string[],
  mentioned: readonly string[],
): boolean {
  const itemNorm = normalizeValueList(itemValues);
  const mentionedNorm = normalizeValueList(mentioned);

  if (mentionedNorm.length === 0) {
    return isMissingValueList(itemNorm);
  }

  const itemKeys = new Set(itemNorm.map((v) => v.toLowerCase()));
  return mentionedNorm.every((m) => itemKeys.has(m.toLowerCase()));
}

/** Human-readable label for questions (not used as canonical key). */
export function formatValueSetDisplay(key: string): string {
  const values = parseValueSetKey(key);
  if (values.length === 0) return MISSING_VALUE_SET_KEY;
  return values.join(' + ');
}

/** Collects all attributo segment texts for one category on a corpus item. */
export function getItemAttributoValues(
  item: BundleCorpusItem,
  categoryName: string,
): string[] {
  const key = normalizeSlotCategoryKey(categoryName);
  const texts = item.segments
    .filter(
      (s) =>
        s.categoryType !== 'vincolo' &&
        normalizeSlotCategoryKey(s.categoryName) === key &&
        s.text?.trim(),
    )
    .map((s) => s.text.trim());
  return normalizeValueList(texts);
}

export function getItemAttributoValueSetKey(
  item: BundleCorpusItem,
  categoryName: string,
): string {
  return valueSetKey(getItemAttributoValues(item, categoryName));
}
