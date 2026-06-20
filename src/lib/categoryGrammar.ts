/**
 * Category-level recognition grammars: one grammar per dictionary category.
 * Each named group maps to a canonical token value (not a tree path).
 */
import type { GrammarEntry } from './analysisTypes';
import { groupNameFromSlotSegment, normalizeGrammarEntry, validateGrammarRegex } from './grammarNormalize';
import type { TokenCategory } from './dictionaryTree';
import { normalizeCategoryOrders, syncCategoriesWithTokens } from './dictionaryTree';
import {
  defaultSynonymsForSlot,
  escapeRegexLiteral,
  extractSimpleSynonyms,
  hydratePanelsFromGrammar,
  normalizeSynonymList,
  sortSynonymsAlphabetically,
  type GrammarEditorPanel,
} from './grammarSynonyms';
import { isCanonicalToken, type TokenEntry } from './tokenDictionary';
import { matchGrammarInput } from './grammarMatch';
import {
  compileVincoloResolutionPipeline,
  validateResolutionPipeline,
} from './vincoloResolutionPipeline';
import { isAgeVincoloCategoryName } from './vincoloResolutionGrammar';

/** Sentinel for disambiguation answers meaning "path without this category segment". */
export const NONE_CANONICAL = '__NONE__';

function categoryNeedsGrammar(category: TokenCategory): boolean {
  if (category.type === 'vincolo') {
    return isAgeVincoloCategoryName(category.name);
  }
  return (category.tokenTexts?.length ?? 0) > 0;
}

export function isCategoryGrammarComplete(category: TokenCategory): boolean {
  if (!categoryNeedsGrammar(category)) return true;
  if (category.type === 'vincolo') {
    const pipeline = category.resolution ?? compileVincoloResolutionPipeline(category);
    return pipeline != null && validateResolutionPipeline(pipeline) == null;
  }
  if (!category.grammar?.regex?.trim() || !category.grammar.mappings) return false;
  return validateGrammarRegex(category.grammar.regex, category.grammar.mappings).valid;
}

export function findCategoriesMissingGrammar(categories: TokenCategory[]): string[] {
  return normalizeCategoryOrders(categories)
    .filter((cat) => categoryNeedsGrammar(cat))
    .filter((cat) => !isCategoryGrammarComplete(cat))
    .map((cat) => cat.name);
}

export function isCategoryGrammarsLayerReady(categories: TokenCategory[]): boolean {
  const needed = normalizeCategoryOrders(categories).filter((cat) => categoryNeedsGrammar(cat));
  if (needed.length === 0) return false;
  return needed.every(isCategoryGrammarComplete);
}

function canonicalGroupName(canonicalValue: string, usedNames: Set<string>): string {
  let base = groupNameFromSlotSegment(canonicalValue) || 'valore';
  let groupName = base;
  let suffix = 0;
  while (usedNames.has(groupName)) {
    groupName = `${base}_${suffix}`;
    suffix += 1;
  }
  usedNames.add(groupName);
  return groupName;
}

/** Collects recognition synonyms for one canonical dictionary value. */
export function synonymsForCanonicalValue(
  canonicalText: string,
  tokens: TokenEntry[],
): string[] {
  const entry = tokens.find((t) => isCanonicalToken(t) && t.text === canonicalText);
  if (entry?.grammar?.regex?.trim()) {
    const fromGrammar = extractSimpleSynonyms(entry.grammar, entry.text);
    if (fromGrammar.length > 0) {
      return normalizeSynonymList([canonicalText, ...fromGrammar]);
    }
  }
  return normalizeSynonymList(defaultSynonymsForSlot(canonicalText));
}

/** Builds recognition grammar for attributo categories only. */
export function compileCategoryGrammar(
  category: TokenCategory,
  tokens: TokenEntry[],
): GrammarEntry | null {
  if (category.type === 'vincolo') return null;
  const tokenTexts = category.tokenTexts ?? [];
  if (tokenTexts.length === 0) return null;

  const parts: string[] = [];
  const mappings: Record<string, string> = {};
  const usedNames = new Set<string>();

  for (const canonical of tokenTexts) {
    const synonyms = synonymsForCanonicalValue(canonical, tokens);
    if (synonyms.length === 0) continue;

    const groupName = canonicalGroupName(canonical, usedNames);
    parts.push(`(?<${groupName}>${synonyms.map(escapeRegexLiteral).join('|')})`);
    mappings[groupName] = canonical;
  }

  if (parts.length === 0) return null;

  const entry = normalizeGrammarEntry({ regex: parts.join('|'), mappings });
  const validation = validateGrammarRegex(entry.regex, entry.mappings);
  if (!validation.valid) {
    throw new Error(validation.error ?? `Grammatica categoria "${category.name}" non valida`);
  }
  return entry;
}

/** True when any category's token assignment changed (drag/reassign), not manual grammar edits. */
export function categoryTokenAssignmentChanged(
  previous: TokenCategory[],
  next: TokenCategory[],
): boolean {
  const prevById = new Map(previous.map((cat) => [cat.id, cat]));
  for (const category of next) {
    const prev = prevById.get(category.id);
    if (!prev) return true;
    const prevTexts = [...(prev.tokenTexts ?? [])].sort().join('\0');
    const nextTexts = [...(category.tokenTexts ?? [])].sort().join('\0');
    if (prevTexts !== nextTexts) return true;
  }
  if (next.length !== previous.length) return true;
  return false;
}

/** Clears all stored category grammars (and age-vincolo resolution) before a full rebuild. */
export function clearCategoryGrammars(categories: TokenCategory[]): TokenCategory[] {
  return normalizeCategoryOrders(categories).map((category) => {
    if (category.type === 'vincolo' && isAgeVincoloCategoryName(category.name)) {
      return { ...category, grammar: null, resolution: null, valueKind: null };
    }
    return { ...category, grammar: null };
  });
}

export function applyCategoryGrammars(
  categories: TokenCategory[],
  tokens: TokenEntry[],
  overwriteExisting = false,
): TokenCategory[] {
  return normalizeCategoryOrders(categories).map((category) => {
    if (category.type === 'vincolo' && isAgeVincoloCategoryName(category.name)) {
      if (!overwriteExisting && isCategoryGrammarComplete(category)) {
        return category;
      }
      const resolution = compileVincoloResolutionPipeline(category);
      return {
        ...category,
        grammar: null,
        resolution,
        valueKind: resolution ? 'age_years' : null,
      };
    }
    if (!categoryNeedsGrammar(category)) {
      return { ...category, grammar: null };
    }
    if (!overwriteExisting && isCategoryGrammarComplete(category)) {
      return category;
    }
    return {
      ...category,
      grammar: compileCategoryGrammar(category, tokens),
    };
  });
}

export interface CategoryGrammarMatch {
  categoryName: string;
  canonicalValue: string;
}

/** Matches utterance text against a category grammar; returns canonical value or null. */
/** Stored recognition grammar for a dictionary category. */
export function getStoredCategoryGrammar(
  categoryId: string,
  categories: TokenCategory[],
): GrammarEntry | null {
  const category = categories.find((cat) => cat.id === categoryId);
  return category?.grammar?.regex?.trim() ? category.grammar : null;
}

/** Sets recognition grammar on one category; returns new category array. */
export function setCategoryGrammar(
  categories: TokenCategory[],
  categoryId: string,
  grammar: GrammarEntry,
): TokenCategory[] {
  return categories.map((category) =>
    (category.id === categoryId ? { ...category, grammar } : category),
  );
}

/** Builds multi-panel editor state: one panel per canonical value in the category. */
export function buildCategoryGrammarEditorState(
  category: TokenCategory,
  tokens: TokenEntry[],
  grammar: GrammarEntry | null,
): { interactive: boolean; panels: GrammarEditorPanel[]; simpleSynonyms: string[] } {
  const tokenTexts = category.tokenTexts ?? [];
  let panels: GrammarEditorPanel[] = tokenTexts.map((canonical) => ({
    targetPath: canonical,
    label: canonical,
    isParent: false,
    synonyms: [],
  }));
  panels = hydratePanelsFromGrammar(panels, grammar);
  panels = panels.map((panel) => {
    if (panel.synonyms.length > 0) {
      return { ...panel, synonyms: sortSynonymsAlphabetically(panel.synonyms) };
    }
    return {
      ...panel,
      synonyms: sortSynonymsAlphabetically(synonymsForCanonicalValue(panel.targetPath, tokens)),
    };
  });
  return { interactive: true, panels, simpleSynonyms: [] };
}

export function matchCategoryGrammar(
  text: string,
  category: TokenCategory,
  tokens: TokenEntry[] = [],
): CategoryGrammarMatch | null {
  const all = matchAllCategoryGrammarValues(text, category, tokens);
  if (all.length === 0) return null;
  return {
    categoryName: category.name,
    canonicalValue: all[0]!,
  };
}

/**
 * Returns every canonical value in the category that matches the text.
 * Each token is tested independently so multiple values from one category can match.
 */
export function matchAllCategoryGrammarValues(
  text: string,
  category: TokenCategory,
  tokens: TokenEntry[] = [],
): string[] {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return [];

  const canonicals = [...new Set(category.tokenTexts ?? [])];

  const values: string[] = [];
  for (const canonical of canonicals) {
    if (values.includes(canonical)) continue;
    if (canonicalMatchesInCategory(trimmed, category, canonical, tokens)) {
      values.push(canonical);
    }
  }
  return values;
}

function canonicalMatchesInCategory(
  text: string,
  category: TokenCategory,
  canonical: string,
  tokens: TokenEntry[],
): boolean {
  const entry = tokens.find((t) => isCanonicalToken(t) && t.text === canonical);
  if (entry?.grammar?.regex?.trim()) {
    const tokenMatch = matchGrammarInput(text, {
      slot_filling: canonical,
      grammar: entry.grammar,
      answer_grammar: null,
      question: null,
      no_match_1: null,
      no_match_2: null,
      no_match_3: null,
      confirmation_text: null,
      status: null,
    });
    if (tokenMatch.targetPath) return true;
  }

  if (!category.grammar?.regex?.trim()) return false;

  const synonyms = synonymsForCanonicalValue(canonical, tokens);
  if (synonyms.length === 0) return false;

  const groupName = 'valore';
  const regex = `(?<${groupName}>${synonyms.map(escapeRegexLiteral).join('|')})`;
  const grammar = normalizeGrammarEntry({ regex, mappings: { [groupName]: canonical } });
  const validation = validateGrammarRegex(grammar.regex, grammar.mappings);
  if (!validation.valid) return false;

  const categoryMatch = matchGrammarInput(text, {
    slot_filling: category.name,
    grammar,
    answer_grammar: null,
    question: null,
    no_match_1: null,
    no_match_2: null,
    no_match_3: null,
    confirmation_text: null,
    status: null,
  });
  return categoryMatch.targetPath === canonical;
}

/**
 * Prunes category token lists and rebuilds grammars from the live token set.
 * Call after token removal so stale regex groups (e.g. deleted "vasi") cannot match.
 */
export function reconcileCategoryGrammarsWithTokens(
  categories: TokenCategory[],
  tokens: TokenEntry[],
): TokenCategory[] {
  const synced = syncCategoriesWithTokens(categories, tokens);
  return applyCategoryGrammars(synced, tokens, true);
}
