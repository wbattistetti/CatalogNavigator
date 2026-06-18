/**
 * Design-time corpus segmentation: category grammars first, phrase matching fallback.
 * Used for ontology paths, corpus cache, and Convai export (same engine as runtime slot extract).
 */
import {
  getCategoryIdForToken,
  normalizeCategoryOrders,
  orderSegmentsByCategories,
  type SegmentMatch,
  type TokenCategory,
} from './dictionaryTree';
import { canonicalizePathSegments } from './pathCanonicalize';
import {
  getActiveMatchPhrases,
  isCanonicalToken,
  normalizeDescriptionText,
  segmentWordsWithPositions,
  tokenizeToWords,
  type MatchPhrase,
  type SegmentationResult,
  type TokenEntry,
} from './tokenDictionary';
import { matchTextToSlots, normalizeSlotCategoryKey } from './slotExtract';

/** Category grammar regex signature — invalidates segmentation cache when grammars change. */
export function segmentationGrammarSignature(categories: TokenCategory[]): string {
  return normalizeCategoryOrders(categories)
    .map((c) => `${c.id}:${c.grammar?.regex?.trim() ?? ''}`)
    .join('\u001e');
}

function phraseMatches(
  text: string,
  tokens: TokenEntry[],
  prebuiltMatchPhrases?: MatchPhrase[],
): { matches: SegmentMatch[]; unmatched: string[] } {
  const normalized = normalizeDescriptionText(text);
  if (!normalized) return { matches: [], unmatched: [] };

  const matchPhrases = prebuiltMatchPhrases ?? getActiveMatchPhrases(tokens);
  const words = tokenizeToWords(normalized);
  const { matches, unmatched } = segmentWordsWithPositions(words, matchPhrases);
  return { matches, unmatched };
}

function activeCanonicalTexts(tokens: TokenEntry[]): Set<string> {
  return new Set(tokens.filter(isCanonicalToken).map((t) => t.text));
}

function filterPathToCanonicalTokens(path: string, canonicalTexts: Set<string>): string {
  if (!path) return '';
  return path.split('.').filter((seg) => canonicalTexts.has(seg)).join('.');
}

/**
 * Segments one description: grammars per category (attributo), then phrase matches for the rest.
 * Path = category-ordered token segments (one row = one item path).
 */
export function segmentDescriptionGrammarAware(
  text: string,
  tokens: TokenEntry[],
  categories: TokenCategory[] = [],
  prebuiltMatchPhrases?: MatchPhrase[],
): SegmentationResult {
  const normalized = normalizeDescriptionText(text);
  if (!normalized) {
    return { segments: [], path: '', unmatched: [] };
  }

  const ordered = normalizeCategoryOrders(categories);
  const canonicalTexts = activeCanonicalTexts(tokens);
  const { matches: phraseMatchList, unmatched } = phraseMatches(text, tokens, prebuiltMatchPhrases);
  const grammarSlots = matchTextToSlots(normalized.toLowerCase(), tokens, ordered);

  const grammarByCategoryId = new Map<string, string>();
  for (const category of ordered) {
    if (category.type === 'vincolo') continue;
    const slotValue = grammarSlots[normalizeSlotCategoryKey(category.name)];
    if (slotValue && canonicalTexts.has(slotValue)) {
      grammarByCategoryId.set(category.id, slotValue);
    }
  }

  const phraseKept: SegmentMatch[] = [];
  for (const match of phraseMatchList) {
    if (!canonicalTexts.has(match.text)) continue;
    const catId = getCategoryIdForToken(match.text, ordered);
    if (catId && grammarByCategoryId.has(catId)) continue;
    phraseKept.push(match);
  }

  const grammarMatches: SegmentMatch[] = [];
  for (const [, tokenText] of grammarByCategoryId) {
    if (phraseKept.some((m) => m.text === tokenText)) continue;
    grammarMatches.push({ text: tokenText, wordStartIndex: 0 });
  }

  const segments = orderSegmentsByCategories([...phraseKept, ...grammarMatches], ordered);
  const path = canonicalizePathSegments(segments.join('.'), ordered);

  return {
    segments: path ? path.split('.') : segments,
    path,
    unmatched: [...new Set(unmatched)],
  };
}
