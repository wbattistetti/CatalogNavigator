/**
 * Hierarchical dictionary layout: categories order token mounting in the segmentation motor.
 * Categories are UI/ordering metadata only — they do not prefix paths.
 */
import type { TokenEntry } from './tokenDictionary';

export interface TokenCategory {
  id: string;
  name: string;
  /** Lower = earlier in mounted path (0, 1, 2, …). */
  order: number;
  /** Token phrases assigned to this category (display order within category). */
  tokenTexts: string[];
}

export interface DictionaryLayout {
  categories: TokenCategory[];
}

/** Sort key for uncategorized tokens — always after categorized ones. */
export const UNCATEGORIZED_SORT_ORDER = Number.MAX_SAFE_INTEGER;

/** UI sentinel for the virtual "no category" bucket in the dictionary editor. */
export const NO_CATEGORY_SENTINEL = '__no_category__';

const localeSort = (a: string, b: string) =>
  a.localeCompare(b, 'it', { sensitivity: 'base' });

/** Sorts token texts alphabetically (Italian locale). */
export function sortTokenTextsAlphabetically(texts: string[]): string[] {
  return [...texts].sort(localeSort);
}

export interface SegmentMatch {
  text: string;
  /** Word index in the description where this token matched. */
  wordStartIndex: number;
}

function newCategoryId(): string {
  return `cat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Normalizes category list so order is 0..n-1 without gaps. */
export function normalizeCategoryOrders(categories: TokenCategory[]): TokenCategory[] {
  return [...categories]
    .sort((a, b) => a.order - b.order)
    .map((cat, index) => ({ ...cat, order: index }));
}

/** Returns category id containing this token text, or null if at root. */
export function getCategoryIdForToken(
  tokenText: string,
  categories: TokenCategory[],
): string | null {
  for (const cat of categories) {
    if (cat.tokenTexts.includes(tokenText)) return cat.id;
  }
  return null;
}

/** Sort order for mounting: category.order, or UNCATEGORIZED_SORT_ORDER for root tokens. */
export function getCategorySortOrder(
  tokenText: string,
  categories: TokenCategory[],
): number {
  const id = getCategoryIdForToken(tokenText, categories);
  if (!id) return UNCATEGORIZED_SORT_ORDER;
  const cat = categories.find((c) => c.id === id);
  return cat?.order ?? UNCATEGORIZED_SORT_ORDER;
}

/**
 * Reorders matched segments by category order, then text position within same category.
 * Uncategorized tokens are placed last (still sorted by text position among themselves).
 */
export function orderSegmentsByCategories(
  matches: SegmentMatch[],
  categories: TokenCategory[],
): string[] {
  if (matches.length === 0) return [];
  const sorted = [...matches].sort((a, b) => {
    const orderA = getCategorySortOrder(a.text, categories);
    const orderB = getCategorySortOrder(b.text, categories);
    if (orderA !== orderB) return orderA - orderB;
    return a.wordStartIndex - b.wordStartIndex;
  });
  return sorted.map((m) => m.text);
}

/** Removes a token text from every category (e.g. before reassignment). */
export function stripTokenFromCategories(
  categories: TokenCategory[],
  tokenText: string,
): TokenCategory[] {
  return categories.map((cat) => ({
    ...cat,
    tokenTexts: cat.tokenTexts.filter((t) => t !== tokenText),
  }));
}

/** All token texts referenced in categories. */
export function categorizedTokenTexts(categories: TokenCategory[]): Set<string> {
  const out = new Set<string>();
  for (const cat of categories) {
    for (const t of cat.tokenTexts) out.add(t);
  }
  return out;
}

/** Token texts not assigned to any category (root level); excludes aliases. */
export function rootTokenTexts(tokens: TokenEntry[], categories: TokenCategory[]): string[] {
  const inCat = categorizedTokenTexts(categories);
  return sortTokenTextsAlphabetically(
    tokens
      .filter((t) => !t.aliasOf)
      .map((t) => t.text)
      .filter((text) => !inCat.has(text)),
  );
}

/** Finds a category by name (case-insensitive trim). */
export function findCategoryByName(
  categories: TokenCategory[],
  name: string,
): TokenCategory | undefined {
  const key = name.trim().toLowerCase();
  if (!key) return undefined;
  return categories.find((c) => c.name.trim().toLowerCase() === key);
}

/** Token texts for the active category view (sorted alphabetically). */
export function tokenTextsForCategoryView(
  categoryKey: string,
  tokens: TokenEntry[],
  categories: TokenCategory[],
): string[] {
  if (categoryKey === NO_CATEGORY_SENTINEL) {
    return rootTokenTexts(tokens, categories);
  }
  const cat = categories.find((c) => c.id === categoryKey);
  if (!cat) return [];
  return sortTokenTextsAlphabetically(cat.tokenTexts);
}

/** Moves a token into a category and keeps tokenTexts sorted alphabetically. */
export function addTokenToCategorySorted(
  categories: TokenCategory[],
  categoryId: string,
  tokenText: string,
): TokenCategory[] {
  const next = moveTokensToCategory(categories, categoryId, [tokenText]);
  return next.map((cat) =>
    cat.id === categoryId
      ? { ...cat, tokenTexts: sortTokenTextsAlphabetically(cat.tokenTexts) }
      : cat,
  );
}

/** Reorders a category to a new index in the normalized list. */
export function reorderCategoryToIndex(
  categories: TokenCategory[],
  categoryId: string,
  targetIndex: number,
): TokenCategory[] {
  const sorted = normalizeCategoryOrders(categories);
  const fromIndex = sorted.findIndex((c) => c.id === categoryId);
  if (fromIndex < 0) return sorted;

  const clamped = Math.max(0, Math.min(targetIndex, sorted.length - 1));
  if (fromIndex === clamped) return sorted;

  const next = [...sorted];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(clamped, 0, moved!);
  return normalizeCategoryOrders(next);
}

/** Creates a category; selected tokens are moved into it. */
export function createCategoryWithTokens(
  categories: TokenCategory[],
  name: string,
  tokenTexts: string[],
): TokenCategory[] {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Nome categoria obbligatorio');

  let next = stripTokenFromAll(categories, tokenTexts);
  const order = next.length;
  const id = newCategoryId();
  const unique = [...new Set(tokenTexts)];
  next = [...next, { id, name: trimmed, order, tokenTexts: unique }];
  return normalizeCategoryOrders(next);
}

function stripTokenFromAll(categories: TokenCategory[], tokenTexts: string[]): TokenCategory[] {
  let next = categories;
  for (const text of tokenTexts) {
    next = stripTokenFromCategories(next, text);
  }
  return next;
}

/** Moves tokens into an existing category. */
export function moveTokensToCategory(
  categories: TokenCategory[],
  categoryId: string,
  tokenTexts: string[],
): TokenCategory[] {
  let next = stripTokenFromAll(categories, tokenTexts);
  const unique = [...new Set(tokenTexts)];
  next = next.map((cat) =>
    cat.id === categoryId
      ? { ...cat, tokenTexts: [...cat.tokenTexts, ...unique.filter((t) => !cat.tokenTexts.includes(t))] }
      : cat,
  );
  const target = next.find((c) => c.id === categoryId);
  if (!target) throw new Error('Categoria non trovata');
  return next;
}

/** Decategorizes tokens (moves to dictionary root). */
export function moveTokensToRoot(
  categories: TokenCategory[],
  tokenTexts: string[],
): TokenCategory[] {
  return stripTokenFromAll(categories, tokenTexts);
}

/** Deletes a category only when it has no tokens. */
export function deleteCategoryIfEmpty(
  categories: TokenCategory[],
  categoryId: string,
): TokenCategory[] {
  const cat = categories.find((c) => c.id === categoryId);
  if (!cat) return categories;
  if (cat.tokenTexts.length > 0) {
    throw new Error('Rimuovi prima i token dalla categoria');
  }
  return normalizeCategoryOrders(categories.filter((c) => c.id !== categoryId));
}

/** Swaps category order with the neighbour above/below. */
export function reorderCategory(
  categories: TokenCategory[],
  categoryId: string,
  direction: 'up' | 'down',
): TokenCategory[] {
  const sorted = normalizeCategoryOrders(categories);
  const index = sorted.findIndex((c) => c.id === categoryId);
  if (index < 0) return sorted;
  const swapIndex = direction === 'up' ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= sorted.length) return sorted;

  const next = sorted.map((cat) => ({ ...cat }));
  const a = next[index]!;
  const b = next[swapIndex]!;
  next[index] = { ...a, order: b.order };
  next[swapIndex] = { ...b, order: a.order };
  return normalizeCategoryOrders(next);
}

/** Renames a category. */
export function renameCategory(
  categories: TokenCategory[],
  categoryId: string,
  name: string,
): TokenCategory[] {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Nome categoria obbligatorio');
  return categories.map((cat) =>
    cat.id === categoryId ? { ...cat, name: trimmed } : cat,
  );
}

/** When a token is removed from the dictionary, drop it from all categories. */
export function removeTokenFromLayout(
  categories: TokenCategory[],
  tokenText: string,
): TokenCategory[] {
  return stripTokenFromCategories(categories, tokenText);
}

/** Loads categories from saved payload; migrates flat dictionaries to empty categories. */
export function loadSavedCategories(
  saved: { categories?: TokenCategory[] } | null | undefined,
): TokenCategory[] {
  if (!saved?.categories?.length) return [];
  return normalizeCategoryOrders(
    saved.categories.map((cat) => ({
      id: cat.id || newCategoryId(),
      name: cat.name?.trim() || 'Categoria',
      order: typeof cat.order === 'number' ? cat.order : 0,
      tokenTexts: Array.isArray(cat.tokenTexts) ? [...cat.tokenTexts] : [],
    })),
  );
}

/** Prunes category token lists to tokens that still exist in the dictionary. */
export function syncCategoriesWithTokens(
  categories: TokenCategory[],
  tokens: TokenEntry[],
): TokenCategory[] {
  const valid = new Set(tokens.map((t) => t.text));
  return categories.map((cat) => ({
    ...cat,
    tokenTexts: cat.tokenTexts.filter((t) => valid.has(t)),
  }));
}
