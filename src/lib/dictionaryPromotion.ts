/**
 * Promote project dictionaries to library and move whole categories into library dictionaries.
 */
import type { TokenCategory } from './dictionaryTree';
import {
  normalizeCategoryOrders,
  syncCategoriesWithTokens,
} from './dictionaryTree';
import { enrichCategoryIcons } from './categoryIconCatalog';
import { defaultIconForIndustry, validateDictionaryMeta } from './dictionaryIndustries';
import type { KbDictionary } from './dictionaryLibrary';
import {
  createDictionary,
  linkLibraryDictionary,
  updateDictionary,
} from './dictionaryLibrary';
import type { TokenEntry } from './tokenDictionary';
import { supabase } from './supabase';

export type MoveCategoryTarget =
  | { mode: 'new'; name: string }
  | { mode: 'existing'; dictionaryId: string };

function newCategoryId(): string {
  return `cat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function rowToDictionary(row: Record<string, unknown>): KbDictionary {
  return {
    id: String(row.id),
    name: String(row.name),
    industry: String(row.industry),
    industry_custom: row.industry_custom != null ? String(row.industry_custom) : null,
    description: row.description != null ? String(row.description) : null,
    scope: row.scope as KbDictionary['scope'],
    project_id: row.project_id != null ? String(row.project_id) : null,
    icon_key: String(row.icon_key ?? 'BookOpen'),
    icon_color: String(row.icon_color ?? '#38bdf8'),
    categories: Array.isArray(row.categories) ? row.categories as TokenCategory[] : [],
    tokens: Array.isArray(row.tokens) ? row.tokens as TokenEntry[] : [],
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

/** Tokens belonging to a category (canonical phrases + their aliases). */
export function tokensForCategory(
  tokens: TokenEntry[],
  category: TokenCategory,
): TokenEntry[] {
  const canonicals = new Set(category.tokenTexts);
  return tokens.filter(
    (t) => canonicals.has(t.text) || (t.aliasOf != null && canonicals.has(t.aliasOf)),
  );
}

/** Removes a category and its tokens from a dictionary snapshot. */
export function extractCategoryFromSource(
  tokens: TokenEntry[],
  categories: TokenCategory[],
  categoryId: string,
): {
  sourceTokens: TokenEntry[];
  sourceCategories: TokenCategory[];
  movedCategory: TokenCategory;
  movedTokens: TokenEntry[];
} {
  const category = categories.find((c) => c.id === categoryId);
  if (!category) throw new Error('Categoria non trovata');

  const movedTokens = tokensForCategory(tokens, category);
  const removeTexts = new Set(movedTokens.map((t) => t.text));
  const sourceTokens = tokens.filter((t) => !removeTexts.has(t.text));
  const sourceCategories = normalizeCategoryOrders(
    categories.filter((c) => c.id !== categoryId),
  );

  const movedCategory = enrichCategoryIcons({
    ...category,
    id: newCategoryId(),
    order: 0,
    tokenTexts: [...category.tokenTexts],
  });

  return { sourceTokens, sourceCategories, movedCategory, movedTokens };
}

function normalizeCategoryName(name: string): string {
  return name.trim().toLowerCase();
}

/** Merges an extracted category into a library dictionary snapshot. */
export function mergeCategoryIntoTarget(
  tokens: TokenEntry[],
  categories: TokenCategory[],
  movedCategory: TokenCategory,
  movedTokens: TokenEntry[],
): { tokens: TokenEntry[]; categories: TokenCategory[] } {
  const existingTexts = new Set(tokens.map((t) => t.text));
  const mergedTokens = [...tokens];
  for (const entry of movedTokens) {
    if (!existingTexts.has(entry.text)) {
      mergedTokens.push(entry);
      existingTexts.add(entry.text);
    }
  }

  const nameKey = normalizeCategoryName(movedCategory.name);
  const existing = categories.find((c) => normalizeCategoryName(c.name) === nameKey);

  let mergedCategories: TokenCategory[];
  if (existing) {
    mergedCategories = categories.map((c) => (
      c.id === existing.id
        ? {
            ...c,
            tokenTexts: [...new Set([...c.tokenTexts, ...movedCategory.tokenTexts])],
            iconKey: c.iconKey ?? movedCategory.iconKey,
            iconColor: c.iconColor ?? movedCategory.iconColor,
          }
        : c
    ));
  } else {
    mergedCategories = normalizeCategoryOrders([
      ...categories,
      { ...movedCategory, order: categories.length },
    ]);
  }

  return {
    tokens: mergedTokens,
    categories: syncCategoriesWithTokens(mergedCategories, mergedTokens),
  };
}

/** Validates a library dictionary name (must be non-empty and not the reserved Project label). */
export function validateLibraryDictionaryName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Nome dizionario libreria obbligatorio');
  if (trimmed.toLowerCase() === 'project') {
    throw new Error('Il nome libreria non può essere «Project»');
  }
  return trimmed;
}

export interface PromoteDictionaryMeta {
  name: string;
  industry: string;
  industryCustom?: string | null;
  description?: string | null;
}

/** Promotes a project-scoped dictionary to library and links it to the project. */
export async function promoteProjectDictionaryToLibrary(
  dictionaryId: string,
  projectId: string,
  meta: PromoteDictionaryMeta,
): Promise<KbDictionary> {
  const { data: row, error } = await supabase
    .from('kb_dictionaries')
    .select('*')
    .eq('id', dictionaryId)
    .single();
  if (error || !row) throw new Error(error?.message ?? 'Dizionario non trovato');

  const dict = row as Record<string, unknown>;
  if (String(dict.scope) !== 'project') {
    throw new Error('Solo i dizionari di progetto possono essere promossi a libreria');
  }
  if (String(dict.project_id) !== projectId) {
    throw new Error('Il dizionario non appartiene a questo progetto');
  }

  const name = validateLibraryDictionaryName(meta.name);
  validateDictionaryMeta({
    name,
    industry: meta.industry,
    industryCustom: meta.industryCustom,
  });
  const { iconKey, iconColor } = defaultIconForIndustry(meta.industry);

  const { data: updated, error: updErr } = await supabase
    .from('kb_dictionaries')
    .update({
      scope: 'library',
      project_id: null,
      name,
      industry: meta.industry,
      industry_custom: meta.industry === 'other' ? meta.industryCustom?.trim() ?? null : null,
      description: meta.description?.trim() || null,
      icon_key: iconKey,
      icon_color: iconColor,
      updated_at: new Date().toISOString(),
    })
    .eq('id', dictionaryId)
    .select('*')
    .single();
  if (updErr || !updated) throw new Error(updErr?.message ?? 'Promozione fallita');

  await linkLibraryDictionary(projectId, dictionaryId);
  return rowToDictionary(updated as Record<string, unknown>);
}

export interface MoveCategoryToLibraryParams {
  sourceDictionaryId: string;
  categoryId: string;
  projectId: string;
  sourceTokens: TokenEntry[];
  sourceCategories: TokenCategory[];
  sourceIndustry: string;
  sourceIndustryCustom: string | null;
  target: MoveCategoryTarget;
}

/** Moves one category (and its tokens) from a project dictionary into library. */
export async function moveCategoryToLibrary(
  params: MoveCategoryToLibraryParams,
): Promise<{ source: KbDictionary; target: KbDictionary }> {
  const {
    sourceDictionaryId,
    categoryId,
    projectId,
    sourceTokens,
    sourceCategories,
    sourceIndustry,
    sourceIndustryCustom,
    target,
  } = params;

  const {
    sourceTokens: nextSourceTokens,
    sourceCategories: nextSourceCategories,
    movedCategory,
    movedTokens,
  } = extractCategoryFromSource(sourceTokens, sourceCategories, categoryId);

  if (movedTokens.length === 0) {
    throw new Error('La categoria non contiene token da spostare');
  }

  const source = await updateDictionary(sourceDictionaryId, {
    tokens: nextSourceTokens,
    categories: nextSourceCategories,
  });

  let targetDict: KbDictionary;

  if (target.mode === 'new') {
    const name = target.name.trim();
    if (!name) throw new Error('Nome dizionario libreria obbligatorio');
    const created = await createDictionary({
      name,
      industry: sourceIndustry,
      industryCustom: sourceIndustryCustom,
      description: `Categoria «${movedCategory.name}» promossa da progetto`,
      scope: 'library',
      projectId: null,
    });
    targetDict = await updateDictionary(created.id, {
      tokens: movedTokens,
      categories: normalizeCategoryOrders([movedCategory]),
    });
  } else {
    const { data: row, error } = await supabase
      .from('kb_dictionaries')
      .select('*')
      .eq('id', target.dictionaryId)
      .single();
    if (error || !row) throw new Error(error?.message ?? 'Dizionario libreria non trovato');
    if (String((row as Record<string, unknown>).scope) !== 'library') {
      throw new Error('Il dizionario di destinazione deve essere di libreria');
    }

    const currentTokens = Array.isArray(row.tokens) ? row.tokens as TokenEntry[] : [];
    const currentCategories = Array.isArray(row.categories) ? row.categories as TokenCategory[] : [];
    const merged = mergeCategoryIntoTarget(
      currentTokens,
      currentCategories,
      movedCategory,
      movedTokens,
    );
    targetDict = await updateDictionary(target.dictionaryId, merged);
  }

  await linkLibraryDictionary(projectId, targetDict.id);
  return { source, target: targetDict };
}
