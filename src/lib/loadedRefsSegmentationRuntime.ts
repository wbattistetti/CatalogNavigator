/**
 * Precomputed dictionary layout for bulk corpus segmentation (avoids per-row rebuild).
 */
import { normalizeCategoryOrders, orderSegmentsByCategories, type TokenCategory } from './dictionaryTree';
import {
  buildTaggedMatchPhrases,
  mergeLoadedTokens,
  type LoadedDictionaryRef,
} from './multiDictionarySegment';

import { getPathOrderingCategories, getPrimaryLoadedDictionaryRef } from './pathCanonicalize';
import {
  getActiveMatchPhrases,
  isCanonicalToken,
  type MatchPhrase,
  type TokenEntry,
} from './tokenDictionary';
import { buildCategoryGrammarBulkIndex, type CategoryGrammarBulkIndex } from './categoryGrammarBulkIndex';
import { getWordPhraseMatcher } from './wordPhraseMatcher';

type TaggedPhrase = ReturnType<typeof buildTaggedMatchPhrases>[number];

export interface LoadedRefsSegmentationRuntime {
  mergedTokens: TokenEntry[];
  pathCategories: TokenCategory[];
  orderedCategories: TokenCategory[];
  grammarMatchPhrases: MatchPhrase[];
  taggedPhrases: TaggedPhrase[];
  canonicalTexts: Set<string>;
  tokenDictionaryIdByText: Map<string, string>;
  primaryDictionaryId: string;
  grammarBulkIndex: CategoryGrammarBulkIndex;
}

/** Builds phrase lists, matchers, and lookup maps once per corpus build. */
export function buildLoadedRefsSegmentationRuntime(
  loaded: LoadedDictionaryRef[],
  prebuiltTaggedPhrases?: TaggedPhrase[],
): LoadedRefsSegmentationRuntime {
  const mergedTokens = mergeLoadedTokens(loaded);
  const pathCategories = getPathOrderingCategories(loaded);
  const orderedCategories = normalizeCategoryOrders(pathCategories);
  const grammarMatchPhrases = getActiveMatchPhrases(mergedTokens);
  const taggedPhrases = prebuiltTaggedPhrases ?? buildTaggedMatchPhrases(loaded);

  getWordPhraseMatcher(taggedPhrases);
  getWordPhraseMatcher(grammarMatchPhrases);

  const canonicalTexts = new Set(
    mergedTokens.filter(isCanonicalToken).map((t) => t.text),
  );

  const tokenDictionaryIdByText = new Map<string, string>();
  const sorted = [...loaded].sort((a, b) => a.priority - b.priority);
  for (const ref of sorted) {
    for (const t of ref.dictionary.tokens) {
      if (!tokenDictionaryIdByText.has(t.text)) {
        tokenDictionaryIdByText.set(t.text, ref.dictionary.id);
      }
    }
  }

  return {
    mergedTokens,
    pathCategories,
    orderedCategories,
    grammarMatchPhrases,
    taggedPhrases,
    canonicalTexts,
    tokenDictionaryIdByText,
    primaryDictionaryId: getPrimaryLoadedDictionaryRef(loaded)?.dictionary.id ?? '',
    grammarBulkIndex: buildCategoryGrammarBulkIndex(orderedCategories, mergedTokens),
  };
}

/** Orders tagged matches using precomputed path categories. */
export function orderTaggedMatchesByCategories(
  matches: Array<{ text: string; wordStartIndex: number; dictionaryId: string; priority: number }>,
  categories: TokenCategory[],
  primaryDictionaryId: string,
): Array<{ text: string; dictionaryId: string }> {
  if (matches.length === 0) return [];

  const uniqueByText = new Map<string, typeof matches[number]>();
  for (const match of [...matches].sort((a, b) => a.priority - b.priority)) {
    if (!uniqueByText.has(match.text)) uniqueByText.set(match.text, match);
  }
  const deduped = [...uniqueByText.values()];

  const orderedTexts = orderSegmentsByCategories(
    deduped.map((m) => ({ text: m.text, wordStartIndex: m.wordStartIndex })),
    categories,
  );
  const byText = new Map(deduped.map((m) => [m.text, m]));

  return orderedTexts.map((text) => {
    const match = byText.get(text);
    return {
      text,
      dictionaryId: match?.dictionaryId ?? primaryDictionaryId,
    };
  });
}
