/**
 * Hierarchical dictionary layout: categories order token mounting in the segmentation motor.
 * Categories are UI/ordering metadata only — they do not prefix paths.
 */
import { enrichCategoryIcons } from './categoryIconCatalog';
import { hydrateCategoryFromStorage, updateCategorySettings } from './categoryCardinality';
import type { CategoryCardinality } from './categoryCardinality';
import type { VincoloResolutionPipeline } from './vincoloResolutionPipeline';
import type { TokenEntry } from './tokenDictionary';

/** Catalog dimension (disambiguation) vs eligibility constraint (e.g. age rules). */
export type CategoryType = 'attributo' | 'vincolo';

export type { CategoryCardinality };

export const DEFAULT_CATEGORY_TYPE: CategoryType = 'attributo';

export interface TokenCategory {
  id: string;
  name: string;
  /** Lower = earlier in mounted path (0, 1, 2, …). */
  order: number;
  /** Token phrases assigned to this category (display order within category). */
  tokenTexts: string[];
  /**
   * attributo = catalog dimension (specialty, exam, body part…).
   * vincolo = eligibility rule (e.g. age band) — not a user choice among siblings.
   */
  type?: CategoryType;
  /**
   * attributo only: single = at most one value per item (winner resolves conflicts);
   * multi = multiple values allowed (e.g. esame). Default single.
   */
  cardinality?: CategoryCardinality;
  /** attributo + single only: canonical token that wins when multiple values match. */
  winner?: string;
  /** Recognition grammar: one group per canonical value in this category. */
  grammar?: GrammarEntry | null;
  /** Vincolo only: resolution pipeline executed by VB at runtime (value + unit). */
  resolution?: VincoloResolutionPipeline | null;
  /** Vincolo only: expected normalized value kind for catalog filtering. */
  valueKind?: 'age_years' | null;
  /** Lucide icon key (assigned once at category creation). */
  iconKey?: string;
  /** Glossy-console accent color (hex). */
  iconColor?: string;
}

/** Normalizes persisted category type; unknown values default to attributo. */
export function normalizeCategoryType(type: string | undefined | null): CategoryType {
  return type === 'vincolo' ? 'vincolo' : DEFAULT_CATEGORY_TYPE;
}

function normalizeCategoryNameForMatch(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

/** Heuristic: category names that denote eligibility constraints (e.g. age bands). */
export function isLikelyConstraintCategoryName(name: string): boolean {
  const n = normalizeCategoryNameForMatch(name);
  if (!n) return false;
  if (n.includes('vincol')) return true;
  if (n.includes('prerequisit') || n.includes('requisit')) return true;
  if (n.includes('fascia') && (n.includes('eta') || n.includes('anni') || n.includes('peso'))) return true;
  if (n === 'eta' || n.startsWith('eta ')) return true;
  return false;
}

/**
 * Category type for Convai structured KB export: explicit vincolo, else name heuristic
 * (e.g. "fascia di età" → vincolo even before editor toggle is saved).
 */
export function resolveCategoryTypeForExport(
  category: Pick<TokenCategory, 'name' | 'type'>,
): CategoryType {
  if (normalizeCategoryType(category.type) === 'vincolo') return 'vincolo';
  if (isLikelyConstraintCategoryName(category.name)) return 'vincolo';
  return DEFAULT_CATEGORY_TYPE;
}

/** Category semantic type for a token (uncategorized → attributo). */
export function getCategoryTypeForToken(
  tokenText: string,
  categories: TokenCategory[],
): CategoryType {
  const id = getCategoryIdForToken(tokenText, categories);
  if (!id) return DEFAULT_CATEGORY_TYPE;
  const cat = categories.find((c) => c.id === id);
  return normalizeCategoryType(cat?.type);
}

/** Updates the semantic type of one category (clears cardinality/winner when vincolo). */
export function setCategoryType(
  categories: TokenCategory[],
  categoryId: string,
  type: CategoryType,
): TokenCategory[] {
  return updateCategorySettings(categories, categoryId, { type: normalizeCategoryType(type) });
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

/** Sorts by `order` then renumbers 0..n-1. */
export function normalizeCategoryOrders(categories: TokenCategory[]): TokenCategory[] {
  return [...categories]
    .sort((a, b) => a.order - b.order)
    .map((cat, index) => ({ ...cat, order: index }));
}

/** Renumbers `order` to match the current array sequence (no sort). */
export function renumberCategoryOrders(categories: TokenCategory[]): TokenCategory[] {
  return categories.map((cat, index) => ({ ...cat, order: index }));
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

/**
 * Signature of category layout that affects corpus segmentation order.
 * Empty categories do not change segment ordering — omitted from the signature.
 */
export function segmentationCategorySignature(categories: TokenCategory[]): string {
  return normalizeCategoryOrders(categories)
    .filter((c) => c.tokenTexts.length > 0)
    .map((c) => `${c.order}:${[...c.tokenTexts].sort(localeSort).join('\u001f')}`)
    .join('\u001e');
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

/** Compares two path tokens by category.order (vincolo uses the same order as attributo), then label. */
export function compareTokenSegmentOrder(
  tokenA: string,
  tokenB: string,
  categories: TokenCategory[],
): number {
  const ordered = normalizeCategoryOrders(categories);
  const orderA = getCategorySortOrder(tokenA, ordered);
  const orderB = getCategorySortOrder(tokenB, ordered);
  if (orderA !== orderB) return orderA - orderB;

  return localeSort(tokenA, tokenB);
}

/**
 * Reorders matched segments by category.order (vincolo included); uncategorized last.
 * Within the same category order, preserves text position in the source phrase.
 */
export function orderSegmentsByCategories(
  matches: SegmentMatch[],
  categories: TokenCategory[],
): string[] {
  if (matches.length === 0) return [];
  const ordered = normalizeCategoryOrders(categories);
  const sorted = [...matches].sort((a, b) => {
    const orderA = getCategorySortOrder(a.text, ordered);
    const orderB = getCategorySortOrder(b.text, ordered);
    if (orderA !== orderB) return orderA - orderB;
    if (a.wordStartIndex !== b.wordStartIndex) return a.wordStartIndex - b.wordStartIndex;
    return localeSort(a.text, b.text);
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

/**
 * Reorders a category to a new insertion slot (0..length).
 * Slot N inserts before the category currently at index N; length appends at end.
 */
export function reorderCategoryToIndex(
  categories: TokenCategory[],
  categoryId: string,
  insertionIndex: number,
): TokenCategory[] {
  const sorted = normalizeCategoryOrders(categories);
  const fromIndex = sorted.findIndex((c) => c.id === categoryId);
  if (fromIndex < 0) return sorted;

  const insertion = Math.max(0, Math.min(insertionIndex, sorted.length));
  if (insertion === fromIndex) return sorted;

  const next = [...sorted];
  const [moved] = next.splice(fromIndex, 1);
  let toIndex = insertion;
  if (fromIndex < insertion) toIndex -= 1;
  toIndex = Math.max(0, Math.min(toIndex, next.length));
  next.splice(toIndex, 0, moved!);
  return renumberCategoryOrders(next);
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
  const withIcon = enrichCategoryIcons({
    id,
    name: trimmed,
    order,
    tokenTexts: unique,
    type: DEFAULT_CATEGORY_TYPE,
  });
  next = [...next, withIcon];
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
    saved.categories.map((cat) => hydrateCategoryFromStorage(enrichCategoryIcons({
      id: cat.id || newCategoryId(),
      name: cat.name?.trim() || 'Categoria',
      order: typeof cat.order === 'number' ? cat.order : 0,
      tokenTexts: Array.isArray(cat.tokenTexts) ? [...cat.tokenTexts] : [],
      type: normalizeCategoryType(cat.type),
      cardinality: cat.cardinality === 'multi' ? 'multi' : undefined,
      winner: typeof cat.winner === 'string' ? cat.winner : undefined,
      grammar: cat.grammar?.regex?.trim() ? cat.grammar : null,
      resolution: cat.resolution ?? null,
      valueKind: cat.valueKind === 'age_years' ? 'age_years' : null,
      iconKey: cat.iconKey,
      iconColor: cat.iconColor,
    }))),
  );
}

/** Prunes category token lists to tokens that still exist in the dictionary. */
export function syncCategoriesWithTokens(
  categories: TokenCategory[],
  tokens: TokenEntry[],
): TokenCategory[] {
  const valid = new Set(tokens.map((t) => t.text));
  return categories.map((cat) => hydrateCategoryFromStorage({
    ...cat,
    tokenTexts: cat.tokenTexts.filter((t) => valid.has(t)),
  }));
}
