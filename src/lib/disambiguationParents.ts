/**
 * Derives parent prestation token(s) for a disambiguation on a dictionary category.
 */
import { getCategoryIdForToken, normalizeCategoryOrders, type TokenCategory } from './dictionaryTree';
import { normalizeSlotCategoryKey } from './slotExtract';

export interface DisambiguationParentInfo {
  /** Last segment immediately before the disambiguated category (legacy). */
  parents: string[];
  /** Path prefix(es) up to (excluding) the disambiguated category segment. */
  contextPrefixes: string[];
  scope: 'single' | 'multiple' | 'none';
  parentCategoryName: string | null;
}

/** One acquired dialog situation that leads to the same disambiguation signature. */
export interface DisambiguationContextVariant {
  pathPrefix: string;
  acquired: Record<string, string>;
}

function categoryNameForToken(tokenText: string, categories: TokenCategory[]): string | null {
  const id = getCategoryIdForToken(tokenText, categories);
  if (!id) return null;
  return categories.find((c) => c.id === id)?.name?.trim() ?? null;
}

function segmentIndexForCategory(
  segments: string[],
  categoryName: string,
  categories: TokenCategory[],
): number {
  const targetKey = normalizeSlotCategoryKey(categoryName);
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]?.trim();
    if (!seg) continue;
    const catName = categoryNameForToken(seg, categories);
    if (catName && normalizeSlotCategoryKey(catName) === targetKey) {
      return i;
    }
  }
  return -1;
}

/**
 * Parent token(s) immediately before the disambiguated category segment in each path.
 */
export function deriveDisambiguationParents(
  categoryName: string,
  candidatePaths: string[],
  categories: TokenCategory[],
): DisambiguationParentInfo {
  const trimmedCategory = categoryName.trim();
  if (!trimmedCategory || candidatePaths.length === 0 || categories.length === 0) {
    return { parents: [], contextPrefixes: [], scope: 'none', parentCategoryName: null };
  }

  const ordered = normalizeCategoryOrders(categories);
  const parents = new Set<string>();
  const contextPrefixes = new Set<string>();
  let parentCategoryName: string | null = null;

  for (const rawPath of candidatePaths) {
    const path = rawPath.trim();
    if (!path) continue;
    const segments = path.split('.').filter(Boolean);
    const idx = segmentIndexForCategory(segments, trimmedCategory, ordered);
    if (idx <= 0) continue;
    const prefix = segments.slice(0, idx).join('.');
    if (prefix) contextPrefixes.add(prefix);
    const parentSeg = segments[idx - 1]!.trim();
    if (!parentSeg) continue;
    parents.add(parentSeg);
    if (!parentCategoryName) {
      parentCategoryName = categoryNameForToken(parentSeg, ordered);
    }
  }

  const prefixList = [...contextPrefixes].sort((a, b) => a.localeCompare(b, 'it'));
  const list = [...parents].sort((a, b) => a.localeCompare(b, 'it'));
  if (list.length === 0) {
    return { parents: [], contextPrefixes: [], scope: 'none', parentCategoryName: null };
  }
  if (list.length === 1) {
    return {
      parents: list,
      contextPrefixes: prefixList,
      scope: 'single',
      parentCategoryName,
    };
  }
  return {
    parents: list,
    contextPrefixes: prefixList,
    scope: 'multiple',
    parentCategoryName,
  };
}

/** UI copy for acquired context before the disambiguation point (single-context view). */
export function formatDisambiguationParentLines(
  info: DisambiguationParentInfo,
): { label: string; value: string } | null {
  if (info.scope === 'none' || info.parents.length === 0) return null;

  const prefixes = info.contextPrefixes.filter((p) => p.trim());
  if (prefixes.length >= 1) {
    return { label: 'Contesto', value: prefixes[0]! };
  }

  const categoryHint = info.parentCategoryName
    ? ` (categoria ${info.parentCategoryName})`
    : '';

  return {
    label: `Contesto${categoryHint}`,
    value: info.parents[0]!,
  };
}

export function hasMultipleDisambiguationContexts(
  parentInfo: DisambiguationParentInfo | null | undefined,
  contextVariants?: DisambiguationContextVariant[],
): boolean {
  if (contextVariants && contextVariants.length > 1) return true;
  const prefixes = parentInfo?.contextPrefixes.filter((p) => p.trim()) ?? [];
  if (prefixes.length > 1) return true;
  return parentInfo?.scope === 'multiple';
}

export function resolveDisambiguationContextVariants(
  parentInfo: DisambiguationParentInfo | null | undefined,
  contextVariants?: DisambiguationContextVariant[],
): DisambiguationContextVariant[] {
  if (contextVariants && contextVariants.length > 0) {
    return contextVariants;
  }
  const prefixes = parentInfo?.contextPrefixes.filter((p) => p.trim()) ?? [];
  if (prefixes.length > 0) {
    return prefixes.map((pathPrefix) => ({ pathPrefix, acquired: {} }));
  }
  if (parentInfo?.parents.length) {
    return parentInfo.parents.map((pathPrefix) => ({ pathPrefix, acquired: {} }));
  }
  return [];
}

/** Action-oriented header for the candidate-path list. */
export function buildDisambiguationPathsLabel(categoryName: string): string {
  const trimmed = categoryName.trim();
  return trimmed
    ? `Devi chiedere «${trimmed}» per disambiguare tra`
    : 'Devi disambiguare tra';
}
