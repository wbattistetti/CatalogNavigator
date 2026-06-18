/**
 * Category-aware NLU rules: sibling choice only within one attributo category.
 */
import { compareSiblingSlots, getDirectChildSlots } from './analysisTree';
import {
  getCategoryIdForToken,
  normalizeCategoryOrders,
  normalizeCategoryType,
  resolveCategoryTypeForExport,
  type TokenCategory,
} from './dictionaryTree';
import {
  isTerminalItemSlot,
} from './itemPaths';

const UNCATEGORIZED_KEY = '__uncategorized__';

function lastSegment(slot: string): string {
  const parts = slot.split('.');
  return parts[parts.length - 1] ?? slot;
}

function sortChildren(children: string[], categories?: TokenCategory[]): string[] {
  return [...children].sort((a, b) => compareSiblingSlots(a, b, categories));
}

/** Groups direct child paths by dictionary category of their last segment. */
export function groupChildrenByCategory(
  slots: string[],
  parentSlot: string,
  categories: TokenCategory[],
): Map<string, string[]> {
  const ordered = normalizeCategoryOrders(categories);
  const groups = new Map<string, string[]>();

  for (const child of getDirectChildSlots(slots, parentSlot)) {
    const token = lastSegment(child);
    const categoryId = getCategoryIdForToken(token, ordered) ?? UNCATEGORIZED_KEY;
    groups.set(categoryId, [...(groups.get(categoryId) ?? []), child]);
  }

  return groups;
}

/**
 * First attributo category (by order) with 2+ direct children under parent.
 * Vincolo siblings never form a choice group.
 */
export function findSiblingChoiceGroup(
  slots: string[],
  parentSlot: string,
  categories: TokenCategory[],
): { category: TokenCategory | null; children: string[] } | null {
  const ordered = normalizeCategoryOrders(categories);
  const groups = groupChildrenByCategory(slots, parentSlot, ordered);

  for (const category of ordered) {
    if (normalizeCategoryType(category.type) === 'vincolo') continue;
    const children = groups.get(category.id) ?? [];
    if (children.length >= 2) {
      return { category, children: sortChildren(children, ordered) };
    }
  }

  const uncategorized = groups.get(UNCATEGORIZED_KEY) ?? [];
  if (uncategorized.length >= 2) {
    return { category: null, children: sortChildren(uncategorized, ordered) };
  }

  return null;
}

/** Direct children that form a same-category sibling choice, or null. */
export function getSiblingChoiceChildren(
  slots: string[],
  slot: string,
  categories?: TokenCategory[],
): string[] | null {
  if (!categories?.length) {
    const children = getDirectChildSlots(slots, slot);
    return children.length >= 2 ? sortChildren(children) : null;
  }
  return findSiblingChoiceGroup(slots, slot, categories)?.children ?? null;
}

/** True when the token belongs to a vincolo category (explicit type or name heuristic). */
export function isVincoloToken(token: string, categories: TokenCategory[]): boolean {
  const ordered = normalizeCategoryOrders(categories);
  const categoryId = getCategoryIdForToken(token, ordered);
  if (!categoryId) return false;
  const category = ordered.find((c) => c.id === categoryId);
  if (!category) return false;
  return resolveCategoryTypeForExport(category) === 'vincolo';
}

/**
 * True when this tree node's last segment is a vincolo token — ask patient age, never a fascia menu.
 */
export function requiresVincoloSegmentQuestionNode(
  slot: string,
  _itemPaths: string[],
  categories?: TokenCategory[],
): boolean {
  if (!categories?.length) return false;
  return isVincoloToken(lastSegment(slot), categories);
}

/** True when node needs a disambiguation question (vincolo segment or attributo siblings). */
export function requiresCategoryAwareInteractiveNode(
  slots: string[],
  slot: string,
  itemPaths: string[],
  categories?: TokenCategory[],
): boolean {
  if (requiresVincoloSegmentQuestionNode(slot, itemPaths, categories)) return true;
  if (isTerminalItemSlot(slot, itemPaths)) return false;
  const siblings = getSiblingChoiceChildren(slots, slot, categories);
  return siblings != null && siblings.length >= 2;
}
