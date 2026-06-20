/**
 * Corpus item paths: explicit complete prestation paths only.
 * A path is the category-ordered concatenation of concept tokens for one bookable item.
 */
import { normalizeCompactPath, sortSlotsTreeOrder } from './analysisTree';
import type { TokenCategory } from './dictionaryTree';

/** Normalizes and deduplicates corpus item paths. */
export function normalizeItemPaths(
  paths: string[],
  categories?: TokenCategory[],
): string[] {
  const out = new Set<string>();
  for (const raw of paths) {
    const n = normalizeCompactPath(raw);
    if (n) out.add(n);
  }
  return sortSlotsTreeOrder([...out], categories);
}

/**
 * Drops paths that are strict dot-prefixes of another path in the same list.
 * For saved item_paths synced against the NLU tree only — not for live corpus compile.
 */
export function leafOnlyItemPaths(paths: string[]): string[] {
  return paths.filter(
    (path) => !paths.some((other) => other !== path && other.startsWith(`${path}.`)),
  );
}

/**
 * Keeps explicit item_paths that exist in the ontology tree and drops prefix-only entries.
 */
export function syncExplicitItemPaths(
  slots: string[],
  explicit?: string[] | null,
  categories?: TokenCategory[],
): string[] {
  if (!explicit?.length) return [];
  const inTree = new Set(slots);
  const normalized = normalizeItemPaths(explicit.filter((p) => inTree.has(p)), categories);
  return leafOnlyItemPaths(normalized);
}

/** Resolves item paths from the stored corpus list (never inferred from tree shape). */
export function resolveItemPaths(
  slots: string[],
  explicit?: string[] | null,
  categories?: TokenCategory[],
): string[] {
  return syncExplicitItemPaths(slots, explicit, categories);
}

/** True when the slot is a bookable corpus item. */
export function isItemSlot(slot: string, itemPaths: string[]): boolean {
  return itemPaths.includes(slot);
}

/** Item paths that are strict descendants of slot. */
export function getDescendantItemSlots(slot: string, itemPaths: string[]): string[] {
  const prefix = slot ? `${slot}.` : '';
  return itemPaths.filter((p) => p.startsWith(prefix));
}

/** True when slot is an item with no longer item path beneath it in the corpus list. */
export function isTerminalItemSlot(slot: string, itemPaths: string[]): boolean {
  return isItemSlot(slot, itemPaths) && getDescendantItemSlots(slot, itemPaths).length === 0;
}

/** Filters item paths present in the current tree. */
export function extractItemPathsInTree(slots: string[], itemPaths: string[]): string[] {
  const inTree = new Set(slots);
  return itemPaths.filter((p) => inTree.has(p));
}

/** Runtime catalog paths: explicit corpus leaves present in the ontology tree. */
export function catalogItemPaths(
  slots: string[],
  explicit?: string[] | null,
  categories?: TokenCategory[],
): string[] {
  return resolveItemPaths(slots, explicit, categories);
}
