/**
 * Pre-built category/token icon catalog (Italian healthcare and general domains).
 * Each category has a distinct accent color stored once at creation.
 */
import type { TokenCategory } from './dictionaryTree';
import type { LoadedDictionaryRef } from './multiDictionarySegment';
import { findDictionaryForToken } from './multiDictionarySegment';
import { DEFAULT_LUCIDE_ICON_KEY } from './lucideIconRegistry';
import { CATEGORY_COLOR } from './categoryIconColors';
import {
  HEALTHCARE_CATEGORY_KEYWORD_RULES,
  HEALTHCARE_EXACT_CATEGORY_ICONS,
  HEALTHCARE_EXACT_TOKEN_ICONS,
  HEALTHCARE_TOKEN_KEYWORD_RULES,
  type CategoryIconSpec,
} from './healthcareIconCatalogData';

export type { CategoryIconSpec };
export { CATEGORY_COLOR };

/** @deprecated Use CATEGORY_COLOR.default */
export const PROJECT_CATEGORY_ICON_COLOR = CATEGORY_COLOR.default;

export const LIBRARY_CHIP_ICON_COLOR = CATEGORY_COLOR.library;

export const NO_CATEGORY_ICON: CategoryIconSpec = {
  iconKey: 'Folder',
  iconColor: CATEGORY_COLOR.noCategory,
};

/** Badge shown on categories with type=vincolo (eligibility rules). */
export const VINCOLO_CATEGORY_BADGE: CategoryIconSpec = {
  iconKey: 'ShieldAlert',
  iconColor: CATEGORY_COLOR.constraint,
};

const DEFAULT_CATEGORY_ICON: CategoryIconSpec = {
  iconKey: DEFAULT_LUCIDE_ICON_KEY,
  iconColor: CATEGORY_COLOR.default,
};

/** General-domain category names (non-healthcare). */
const GENERAL_EXACT_CATEGORY_ICONS: Record<string, CategoryIconSpec> = {
  sede: { iconKey: 'MapPin', iconColor: CATEGORY_COLOR.location },
  struttura: { iconKey: 'Building2', iconColor: CATEGORY_COLOR.location },
};

const GENERAL_CATEGORY_KEYWORD_RULES: Array<{ keywords: string[]; spec: CategoryIconSpec }> = [
  { keywords: ['ospedal', 'clinica', 'sede', 'struttura'], spec: { iconKey: 'MapPin', iconColor: CATEGORY_COLOR.location } },
  { keywords: ['apertura', 'accoglienza'], spec: { iconKey: 'DoorOpen', iconColor: CATEGORY_COLOR.visitType } },
  { keywords: ['nuovo', 'nuova'], spec: { iconKey: 'Sparkles', iconColor: CATEGORY_COLOR.visitType } },
  { keywords: ['ripet', 'ciclo'], spec: { iconKey: 'Repeat', iconColor: CATEGORY_COLOR.visitType } },
  { keywords: ['calendario', 'appuntament'], spec: { iconKey: 'Calendar', iconColor: CATEGORY_COLOR.visitType } },
  { keywords: ['conferm', 'completat'], spec: { iconKey: 'CheckCircle', iconColor: CATEGORY_COLOR.service } },
  { keywords: ['cerca', 'ricerca'], spec: { iconKey: 'FileSearch', iconColor: CATEGORY_COLOR.diagnosis } },
  { keywords: ['0-17', '0 17', 'minoren', 'infanzia'], spec: { iconKey: 'Baby', iconColor: CATEGORY_COLOR.age } },
  { keywords: ['18-39', '18 39', 'giovane adult'], spec: { iconKey: 'User', iconColor: CATEGORY_COLOR.age } },
  { keywords: ['40-64', '40 64', 'mezza eta', 'mezza età'], spec: { iconKey: 'UserRound', iconColor: CATEGORY_COLOR.age } },
  { keywords: ['65', 'anzian', 'geriatr', 'over 65'], spec: { iconKey: 'PersonStanding', iconColor: CATEGORY_COLOR.age } },
  { keywords: ['diagnos'], spec: { iconKey: 'FileText', iconColor: CATEGORY_COLOR.diagnosis } },
  { keywords: ['prestaz', 'servizio'], spec: { iconKey: 'ClipboardCheck', iconColor: CATEGORY_COLOR.service } },
  { keywords: ['attivita', 'attività', 'monitor'], spec: { iconKey: 'Activity', iconColor: CATEGORY_COLOR.symptom } },
];

export interface ChipSurfaceStyle {
  backgroundColor: string;
  borderColor: string;
  color: string;
}

/** Chip background/border/text tints from category accent hex. */
export function chipSurfaceStyleFromColor(hex: string, alphaBg = 0.14, alphaBorder = 0.42): ChipSurfaceStyle {
  return {
    backgroundColor: `${hex}${Math.round(alphaBg * 255).toString(16).padStart(2, '0')}`,
    borderColor: `${hex}${Math.round(alphaBorder * 255).toString(16).padStart(2, '0')}`,
    color: hex,
  };
}

/** Normalizes labels for catalog lookup (lowercase, trim, collapse spaces, strip accents). */
export function normalizeIconLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

function lookupByKeyword(
  normalized: string,
  rules: Array<{ keywords: string[]; spec: CategoryIconSpec }>,
): CategoryIconSpec | null {
  for (const rule of rules) {
    if (rule.keywords.some((kw) => normalized.includes(normalizeIconLabel(kw)))) {
      return rule.spec;
    }
  }
  return null;
}

function lookupTokenIcon(normalized: string): CategoryIconSpec | null {
  if (!normalized) return null;
  return HEALTHCARE_EXACT_TOKEN_ICONS[normalized]
    ?? lookupByKeyword(normalized, HEALTHCARE_TOKEN_KEYWORD_RULES);
}

/** Resolves icon + accent color for a category name (exact match, then keyword rules). */
export function resolveCategoryIcon(categoryName: string): CategoryIconSpec {
  const normalized = normalizeIconLabel(categoryName);
  if (!normalized) return DEFAULT_CATEGORY_ICON;
  return HEALTHCARE_EXACT_CATEGORY_ICONS[normalized]
    ?? GENERAL_EXACT_CATEGORY_ICONS[normalized]
    ?? lookupByKeyword(normalized, HEALTHCARE_CATEGORY_KEYWORD_RULES)
    ?? lookupByKeyword(normalized, GENERAL_CATEGORY_KEYWORD_RULES)
    ?? DEFAULT_CATEGORY_ICON;
}

/** Returns stored icon on category or resolves from its name. */
export function iconForCategory(category: Pick<TokenCategory, 'name' | 'iconKey' | 'iconColor'>): CategoryIconSpec {
  if (category.iconKey && category.iconColor) {
    return { iconKey: category.iconKey, iconColor: category.iconColor };
  }
  if (category.iconKey) {
    return {
      iconKey: category.iconKey,
      iconColor: resolveCategoryIcon(category.name).iconColor,
    };
  }
  return resolveCategoryIcon(category.name);
}

function categoryIdContainingToken(tokenText: string, categories: TokenCategory[]): string | null {
  for (const cat of categories) {
    if (cat.tokenTexts.includes(tokenText)) return cat.id;
  }
  return null;
}

/** Category display name for a token, or "no category" when at dictionary root. */
export function categoryNameForToken(tokenText: string, categories: TokenCategory[]): string {
  const categoryId = categoryIdContainingToken(tokenText, categories);
  if (!categoryId) return 'no category';
  return categories.find((c) => c.id === categoryId)?.name ?? 'no category';
}

/** Tooltip label: "Project - esami" / "LibraryName - specialità". */
export function formatChipTooltipTitle(
  scope: ChipDictionaryScope,
  dictionaryName: string | undefined,
  categoryName: string,
): string {
  const dictLabel = scope === 'project' ? 'Project' : (dictionaryName?.trim() || 'Library');
  return `${dictLabel} - ${categoryName}`;
}

/**
 * Icon for a token: catalog token rules first, then parent category, then no-category bucket.
 */
export function resolveTokenIcon(
  categories: TokenCategory[],
  tokenText: string,
): CategoryIconSpec {
  const tokenSpec = lookupTokenIcon(normalizeIconLabel(tokenText));
  if (tokenSpec) return tokenSpec;

  const categoryId = categoryIdContainingToken(tokenText, categories);
  if (categoryId) {
    const cat = categories.find((c) => c.id === categoryId);
    if (cat) return iconForCategory(cat);
  }
  return NO_CATEGORY_ICON;
}

/** Syncs icon + accent color from catalog (refreshes on load so palette updates apply). */
export function enrichCategoryIcons(category: TokenCategory): TokenCategory {
  const spec = resolveCategoryIcon(category.name);
  return {
    ...category,
    iconKey: spec.iconKey,
    iconColor: spec.iconColor,
  };
}

export type ChipDictionaryScope = 'project' | 'library';

export interface ChipAppearance {
  iconKey: string;
  iconColor: string;
  categoryColor: string;
  scope: ChipDictionaryScope;
  title: string;
}

/** Chip icon + category accent for corpus segmentation and highlights. */
export function resolveChipAppearance(
  tokenText: string,
  loadedRefs: LoadedDictionaryRef[],
  editingDictionaryId: string | null | undefined,
  editingCategories: TokenCategory[],
): ChipAppearance {
  let dictionaryId = editingDictionaryId
    && loadedRefs.some((r) => r.dictionary.id === editingDictionaryId
      && r.dictionary.tokens.some((t) => t.text === tokenText && !t.aliasOf))
    ? editingDictionaryId
    : findDictionaryForToken(tokenText, loadedRefs);

  const ref = dictionaryId
    ? loadedRefs.find((r) => r.dictionary.id === dictionaryId)
    : loadedRefs[0];

  const dict = ref?.dictionary;
  const scope: ChipDictionaryScope = dict?.scope === 'project' ? 'project' : 'library';
  const categories = dict?.categories ?? editingCategories;
  const categoryName = categoryNameForToken(tokenText, categories);
  const icon = resolveTokenIcon(categories, tokenText);
  const categoryColor = icon.iconColor;

  return {
    iconKey: icon.iconKey,
    iconColor: categoryColor,
    categoryColor,
    scope,
    title: formatChipTooltipTitle(scope, dict?.name, categoryName),
  };
}
