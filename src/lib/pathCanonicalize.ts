/**
 * Canonicalizes dotted item paths so segment order follows dictionary category.order.
 * Fixes stale or AI-generated paths without re-segmenting source text.
 */
import { normalizeCompactPath } from './analysisTree';
import {
  compareTokenSegmentOrder,
  getCategorySortOrder,
  normalizeCategoryOrders,
  type TokenCategory,
} from './dictionaryTree';
import type { LoadedDictionaryRef } from './multiDictionarySegment';

/** Primary project dictionary — single category.order source for all path segments. */
export function getPrimaryLoadedDictionaryRef(
  loaded: LoadedDictionaryRef[],
): LoadedDictionaryRef | null {
  if (loaded.length === 0) return null;
  return [...loaded].sort((a, b) => a.priority - b.priority)[0] ?? null;
}

/**
 * Merges category layouts from all loaded dictionaries (project first, then library).
 * Global order is renumbered 0..n so path mounting follows the combined list.
 */
export function getPathOrderingCategories(loaded: LoadedDictionaryRef[]): TokenCategory[] {
  const sorted = [...loaded].sort((a, b) => a.priority - b.priority);
  const merged: TokenCategory[] = [];
  let nextOrder = 0;

  for (const ref of sorted) {
    const cats = normalizeCategoryOrders(ref.dictionary.categories ?? []);
    for (const cat of cats) {
      merged.push({
        ...cat,
        id: `${ref.dictionary.id}:${cat.id}`,
        order: nextOrder++,
      });
    }
  }

  return merged;
}

/** Sort order for a token using the merged loaded-dictionary category layout. */
export function getCategorySortOrderFromLoadedRefs(
  tokenText: string,
  loadedRefs: LoadedDictionaryRef[],
): number {
  return getCategorySortOrder(tokenText, getPathOrderingCategories(loadedRefs));
}

/**
 * Reorders path segments by category.order (T1.T2.T3…).
 * Sibling display in the ontology tree uses the same category layout via orderSlotsDepthFirst.
 */
export function canonicalizePathSegments(
  path: string,
  categories: TokenCategory[],
): string {
  const normalized = normalizeCompactPath(path);
  if (!normalized) return '';

  const orderedCategories = normalizeCategoryOrders(categories);
  const parts = normalized.split('.').filter(Boolean);
  if (parts.length <= 1) return parts.join('.');

  const sorted = [...parts].sort((a, b) =>
    compareTokenSegmentOrder(a, b, orderedCategories),
  );

  return sorted.join('.');
}

/** Canonicalizes path segments using merged loaded-dictionary category.order. */
export function canonicalizePathSegmentsFromLoadedRefs(
  path: string,
  loadedRefs: LoadedDictionaryRef[],
): string {
  return canonicalizePathSegments(path, getPathOrderingCategories(loadedRefs));
}

/** Canonicalizes and deduplicates item paths. */
export function canonicalizeItemPaths(
  paths: string[],
  categories: TokenCategory[],
): string[] {
  const out = new Set<string>();
  for (const raw of paths) {
    const canon = canonicalizePathSegments(raw, categories);
    if (canon) out.add(canon);
  }
  return [...out];
}

/** Canonicalizes item paths across loaded dictionaries. */
export function canonicalizeItemPathsFromLoadedRefs(
  paths: string[],
  loadedRefs: LoadedDictionaryRef[],
): string[] {
  const out = new Set<string>();
  for (const raw of paths) {
    const canon = canonicalizePathSegmentsFromLoadedRefs(raw, loadedRefs);
    if (canon) out.add(canon);
  }
  return [...out];
}

/** True when any path segment order differs from category.order canonical form. */
export function itemPathsNeedCanonicalization(
  paths: string[],
  categories: TokenCategory[],
): boolean {
  return paths.some((raw) => {
    const normalized = normalizeCompactPath(raw);
    if (!normalized) return false;
    return canonicalizePathSegments(normalized, categories) !== normalized;
  });
}

/** True when saved paths need segment reordering (multi-dictionary). */
export function itemPathsNeedCanonicalizationFromLoadedRefs(
  paths: string[],
  loadedRefs: LoadedDictionaryRef[],
): boolean {
  return paths.some((raw) => {
    const normalized = normalizeCompactPath(raw);
    if (!normalized) return false;
    return canonicalizePathSegmentsFromLoadedRefs(normalized, loadedRefs) !== normalized;
  });
}

/** Compares path sets after category-order canonicalization (ignores list sort). */
export function canonicalizedPathSetsEqual(
  left: string[],
  right: string[],
  loadedRefs: LoadedDictionaryRef[],
): boolean {
  const canon = (paths: string[]) => [
    ...new Set(canonicalizeItemPathsFromLoadedRefs(paths, loadedRefs)),
  ].sort((a, b) => a.localeCompare(b, 'it'));
  const a = canon(left);
  const b = canon(right);
  if (a.length !== b.length) return false;
  return a.every((path, index) => path === b[index]);
}
