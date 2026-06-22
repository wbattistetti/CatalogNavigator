/**
 * Rebuilds pharma dictionary token maps from checkpoint via category-aware refactor rules.
 */
import type { PharmaCategoryName } from '../pharmaDictionaryCategories';
import { PHARMA_CATEGORY_NAMES } from '../pharmaDictionaryCategories';
import { isSpellingOnlyAlias } from './atomicAliasFilter';
import {
  postProcessFormaFarmaceutica,
  postProcessNomeCommerciale,
  refactorToken,
  type AliasAssignment,
  type TokenAssignment,
} from './decompose';
import { dedupeTokens, normalizeKey } from './normalize';
import { LEGACY_SOURCE_CATEGORIES, type SourceCategoryName } from './types';

export { LEGACY_SOURCE_CATEGORIES, type SourceCategoryName } from './types';

export interface RefactorStats {
  inputTokens: number;
  outputCanonicalTokens: number;
  outputAliases: number;
  decomposedCount: number;
  formaFarmaceuticaPurified?: number;
  formaFarmaceuticaSplit?: number;
  nomeCommercialePurified?: number;
  nomeCommercialeSplit?: number;
  byCategory: Record<string, number>;
}

export interface RefactorResult {
  tokenCategory: Record<string, PharmaCategoryName>;
  aliases: AliasAssignment[];
  stats: RefactorStats;
}

function isKnownSourceCategory(name: string): name is SourceCategoryName {
  return (
    (PHARMA_CATEGORY_NAMES as readonly string[]).includes(name)
    || (LEGACY_SOURCE_CATEGORIES as readonly string[]).includes(name as (typeof LEGACY_SOURCE_CATEGORIES)[number])
  );
}

/** Applies refactor rules to all tokens in a checkpoint tokenCategory map. */
export function refactorTokenCategoryMap(
  input: Record<string, string>,
): RefactorResult {
  const tokenCategory: Record<string, PharmaCategoryName> = {};
  const aliasList: AliasAssignment[] = [];
  const seenCanonical = new Set<string>();
  let decomposedCount = 0;

  for (const [text, rawCategory] of Object.entries(input)) {
    if (!isKnownSourceCategory(rawCategory)) continue;

    const result = refactorToken(text, rawCategory);
    if (result.tokens.length > 1 || result.aliases.length > 0) decomposedCount += 1;

    for (const assignment of result.tokens) {
      const key = normalizeKey(assignment.text);
      if (!key || seenCanonical.has(key)) continue;
      seenCanonical.add(key);
      tokenCategory[assignment.text] = assignment.category;
    }
    aliasList.push(...result.aliases);
  }

  const postForma = postProcessFormaFarmaceutica(tokenCategory);
  aliasList.push(...postForma.aliases);

  const postBrand = postProcessNomeCommerciale(tokenCategory);
  aliasList.push(...postBrand.aliases);

  const byCategory: Record<string, number> = {};
  for (const cat of PHARMA_CATEGORY_NAMES) byCategory[cat] = 0;
  for (const cat of Object.values(tokenCategory)) {
    byCategory[cat] = (byCategory[cat] ?? 0) + 1;
  }

  return {
    tokenCategory,
    aliases: aliasList,
    stats: {
      inputTokens: Object.keys(input).length,
      outputCanonicalTokens: Object.keys(tokenCategory).length,
      outputAliases: aliasList.length,
      decomposedCount,
      formaFarmaceuticaPurified: postForma.removed,
      formaFarmaceuticaSplit: postForma.split,
      nomeCommercialePurified: postBrand.removed,
      nomeCommercialeSplit: postBrand.split,
      byCategory,
    },
  };
}

export function rebuildByCategory(
  tokenCategory: Record<string, PharmaCategoryName>,
): Record<PharmaCategoryName, string[]> {
  const byCategory = Object.fromEntries(
    PHARMA_CATEGORY_NAMES.map((c) => [c, [] as string[]]),
  ) as Record<PharmaCategoryName, string[]>;

  for (const [text, category] of Object.entries(tokenCategory)) {
    if (!(PHARMA_CATEGORY_NAMES as readonly string[]).includes(category)) continue;
    byCategory[category].push(text);
  }
  for (const cat of PHARMA_CATEGORY_NAMES) {
    byCategory[cat] = dedupeTokens(byCategory[cat]);
  }
  return byCategory;
}

/** Separates canonical tokens from alias surface forms for TokenEntry export. */
export function splitCanonicalAndAliases(
  tokenCategory: Record<string, PharmaCategoryName>,
  aliasAssignments: AliasAssignment[],
): {
  canonicalTexts: string[];
  aliasEntries: Array<{ text: string; aliasOf: string }>;
} {
  const canonicalByKey = new Map<string, string>();
  for (const text of Object.keys(tokenCategory)) {
    canonicalByKey.set(normalizeKey(text), text);
  }

  const aliasEntries: Array<{ text: string; aliasOf: string }> = [];
  const aliasTexts = new Set<string>();

  for (const { phrase, canonical } of aliasAssignments) {
    const canon = canonicalByKey.get(normalizeKey(canonical));
    if (!canon) continue;
    if (normalizeKey(phrase) === normalizeKey(canon)) continue;
    if (canonicalByKey.has(normalizeKey(phrase))) continue;
    const category = tokenCategory[canon];
    if (!isSpellingOnlyAlias(phrase, canon, category)) {
      continue;
    }
    aliasEntries.push({ text: phrase, aliasOf: canon });
    aliasTexts.add(normalizeKey(phrase));
  }

  const canonicalTexts = Object.keys(tokenCategory).filter(
    (t) => !aliasEntries.some((a) => normalizeKey(a.text) === normalizeKey(t)),
  );

  return { canonicalTexts: dedupeTokens(canonicalTexts), aliasEntries };
}

export type { TokenAssignment, AliasAssignment };
