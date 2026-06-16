/**
 * Corpus item paths: bookable prestations distinct from structural-only tree nodes.
 * An item may be an internal node when a longer item path extends it (prefix ambiguity).
 */
import {
  getDirectChildSlots,
  isLeafSlot,
  normalizeCompactPath,
  sortSlotsTreeOrder,
} from './analysisTree';
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
 * Infers item paths from tree shape when explicit corpus paths are missing.
 * Marks a single-child parent as item when its direct child is a structural leaf (prefix ambiguity).
 */
export function inferItemPathsFromSlots(
  slots: string[],
  categories?: TokenCategory[],
): string[] {
  const items = new Set<string>();
  for (const slot of slots) {
    if (isLeafSlot(slots, slot)) items.add(slot);
  }
  for (const slot of slots) {
    if (isLeafSlot(slots, slot)) continue;
    const children = getDirectChildSlots(slots, slot);
    if (children.length === 1 && isLeafSlot(slots, children[0]!)) {
      items.add(slot);
    }
  }
  return sortSlotsTreeOrder([...items], categories);
}

/** Resolves item paths from stored corpus list or tree inference. */
export function resolveItemPaths(slots: string[], explicit?: string[] | null): string[] {
  const inTree = new Set(slots);
  if (explicit?.length) {
    return normalizeItemPaths(explicit.filter((p) => inTree.has(p)));
  }
  return inferItemPathsFromSlots(slots);
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

/** Direct-child item paths under slot. */
export function getDirectChildItemSlots(slot: string, itemPaths: string[]): string[] {
  const prefix = slot ? `${slot}.` : '';
  return itemPaths.filter((p) => {
    if (!p.startsWith(prefix)) return false;
    const rest = p.slice(prefix.length);
    return rest.length > 0 && !rest.includes('.');
  });
}

/** True when slot is an item with at least one other item beneath it. */
export function hasDescendantItem(slot: string, itemPaths: string[]): boolean {
  return getDescendantItemSlots(slot, itemPaths).length > 0;
}

/** True when the user can stop at this item (no further item choice below). */
export function isTerminalItemSlot(slot: string, itemPaths: string[]): boolean {
  return isItemSlot(slot, itemPaths) && !hasDescendantItem(slot, itemPaths);
}

/** True when an item node must disambiguate base vs direct child item extension. */
export function isPrefixAmbiguityNode(
  slots: string[],
  slot: string,
  itemPaths: string[],
): boolean {
  if (!isItemSlot(slot, itemPaths) || isLeafSlot(slots, slot)) return false;
  return getDirectChildItemSlots(slot, itemPaths).length > 0;
}

/** Merges explicit corpus paths with inferred prefix-ambiguity parents after tree edits. */
export function reconcileItemPaths(slots: string[], explicit?: string[] | null): string[] {
  const kept = explicit?.length ? explicit.filter((p) => slots.includes(p)) : [];
  const inferred = inferItemPathsFromSlots(slots);
  return normalizeItemPaths([...kept, ...inferred]);
}

/** Filters item paths present in the current tree. */
export function extractItemPathsInTree(slots: string[], itemPaths: string[]): string[] {
  const inTree = new Set(slots);
  return itemPaths.filter((p) => inTree.has(p));
}

function lastSegment(slot: string): string {
  const parts = slot.split('.');
  return parts[parts.length - 1] ?? slot;
}

function humanize(segment: string): string {
  return segment.replace(/_/g, ' ').replace(/-/g, ' ');
}

/** Builds a disambiguation question for parent-item vs child-item extension. */
export function buildPrefixDisambiguationQuestion(
  parentSlot: string,
  childItemSlots: string[],
): string {
  const parentLabel = humanize(lastSegment(parentSlot));
  if (childItemSlots.length === 1) {
    const childLabel = humanize(lastSegment(childItemSlots[0]!));
    return `Vuole ${parentLabel} semplice o anche ${childLabel}?`;
  }
  const labels = childItemSlots.map((p) => humanize(lastSegment(p))).join(', ');
  return `Vuole ${parentLabel} semplice o includere anche: ${labels}?`;
}
