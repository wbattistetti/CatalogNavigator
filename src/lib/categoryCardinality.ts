/**
 * Category cardinality and winner settings (attributo single/multi, conflict override).
 */
import {
  DEFAULT_CATEGORY_TYPE,
  normalizeCategoryType,
  type CategoryType,
  type TokenCategory,
} from './dictionaryTree';

export type CategoryCardinality = 'single' | 'multi';

export const DEFAULT_CATEGORY_CARDINALITY: CategoryCardinality = 'single';

/** Normalizes persisted cardinality; unknown values default to single. */
export function normalizeCategoryCardinality(
  cardinality: string | undefined | null,
): CategoryCardinality {
  return cardinality === 'multi' ? 'multi' : DEFAULT_CATEGORY_CARDINALITY;
}

export interface CategorySettingBadge {
  key: string;
  label: string;
  title: string;
  variant: 'vincolo' | 'multi' | 'winner';
}

/** Badges for non-default category settings (visible on the category row). */
export function categorySettingBadges(category: TokenCategory): CategorySettingBadge[] {
  const badges: CategorySettingBadge[] = [];
  const type = normalizeCategoryType(category.type);

  if (type === 'vincolo') {
    badges.push({
      key: 'vincolo',
      label: 'vincolo',
      title: "Categoria vincolo: regola di ammissibilità (es. fascia d'età)",
      variant: 'vincolo',
    });
    return badges;
  }

  if (normalizeCategoryCardinality(category.cardinality) === 'multi') {
    badges.push({
      key: 'multi',
      label: 'multi',
      title: 'Cardinalità multipla: più valori ammessi sulla stessa categoria',
      variant: 'multi',
    });
  }

  const winner = category.winner?.trim();
  if (winner && normalizeCategoryCardinality(category.cardinality) === 'single') {
    badges.push({
      key: 'winner',
      label: `winner: ${winner}`,
      title: `In caso di conflitto su questa categoria, prevale «${winner}»`,
      variant: 'winner',
    });
  }

  return badges;
}

export interface CategorySettingsPatch {
  type?: CategoryType;
  cardinality?: CategoryCardinality;
  winner?: string | null;
}

/**
 * Updates category settings with cascade rules:
 * vincolo clears cardinality and winner; multi clears winner.
 */
export function updateCategorySettings(
  categories: TokenCategory[],
  categoryId: string,
  patch: CategorySettingsPatch,
): TokenCategory[] {
  return categories.map((cat) => {
    if (cat.id !== categoryId) return cat;
    return normalizeCategorySettings({ ...cat, ...patch });
  });
}

/** Applies default normalization and mutual-exclusion rules to one category. */
export function normalizeCategorySettings(category: TokenCategory): TokenCategory {
  const type = normalizeCategoryType(category.type);
  if (type === 'vincolo') {
    const { cardinality: _c, winner: _w, ...rest } = category;
    return { ...rest, type: 'vincolo' };
  }

  const cardinality = normalizeCategoryCardinality(category.cardinality);
  if (cardinality === 'multi') {
    const { winner: _w, ...rest } = category;
    return { ...rest, type: DEFAULT_CATEGORY_TYPE, cardinality: 'multi' };
  }

  const winner = category.winner?.trim() || undefined;
  const allowed = new Set(category.tokenTexts);
  const validWinner = winner && allowed.has(winner) ? winner : undefined;
  return {
    ...category,
    type: DEFAULT_CATEGORY_TYPE,
    cardinality: DEFAULT_CATEGORY_CARDINALITY,
    winner: validWinner,
  };
}

/** Persists one category row (omits default single cardinality and empty winner). */
export function serializeCategoryForStorage(category: TokenCategory): TokenCategory {
  const normalized = normalizeCategorySettings(category);
  const type = normalizeCategoryType(normalized.type);
  const stored: TokenCategory = {
    id: normalized.id,
    name: normalized.name,
    order: normalized.order,
    tokenTexts: normalized.tokenTexts,
    type,
    grammar: normalized.grammar?.regex?.trim() ? normalized.grammar : null,
    resolution: normalized.resolution ?? null,
    valueKind: normalized.valueKind === 'age_years' ? 'age_years' : null,
    iconKey: normalized.iconKey,
    iconColor: normalized.iconColor,
  };
  if (type === 'vincolo') return stored;
  if (normalizeCategoryCardinality(normalized.cardinality) === 'multi') {
    return { ...stored, cardinality: 'multi' };
  }
  if (normalized.winner) {
    return { ...stored, cardinality: 'single', winner: normalized.winner };
  }
  return stored;
}

/** Restores persisted category settings after load from JSON. */
export function hydrateCategoryFromStorage(category: TokenCategory): TokenCategory {
  return normalizeCategorySettings({
    ...category,
    type: normalizeCategoryType(category.type),
    cardinality: category.cardinality,
    winner: category.winner,
  });
}
