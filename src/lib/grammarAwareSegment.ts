/**
 * Design-time corpus segmentation: category grammars first, phrase matching fallback.
 * Used for ontology paths, corpus cache, and Convai export (same engine as runtime slot extract).
 */
import {
  normalizeCategoryOrders,
  orderSegmentsByCategories,
  type SegmentMatch,
  type TokenCategory,
} from './dictionaryTree';
import { normalizeCompactPath } from './analysisTree';
import { matchAllCategoryGrammarValues } from './categoryGrammar';
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

function segmentMatchKey(match: SegmentMatch): string {
  return `${match.text}\u001f${match.wordStartIndex}`;
}

function findWordStartIndex(words: string[], tokenText: string): number {
  const parts = tokenizeToWords(tokenText);
  if (parts.length === 0) return 0;
  for (let i = 0; i <= words.length - parts.length; i++) {
    if (parts.every((w, j) => words[i + j] === w)) return i;
  }
  return 0;
}

/** Grammar-only matches for canonical tokens not already found by phrase matching. */
function grammarSupplementMatches(
  text: string,
  tokens: TokenEntry[],
  categories: TokenCategory[],
  canonicalTexts: Set<string>,
  phraseKept: SegmentMatch[],
): SegmentMatch[] {
  const normalized = normalizeDescriptionText(text);
  if (!normalized) return [];

  const lower = normalized.toLowerCase();
  const words = tokenizeToWords(normalized);
  const phraseTexts = new Set(phraseKept.map((m) => m.text));
  const seen = new Set(phraseKept.map(segmentMatchKey));
  const supplements: SegmentMatch[] = [];

  for (const category of normalizeCategoryOrders(categories)) {
    if (category.type === 'vincolo') continue;

    for (const canonical of matchAllCategoryGrammarValues(lower, category, tokens)) {
      if (!canonicalTexts.has(canonical) || phraseTexts.has(canonical)) continue;
      const match: SegmentMatch = {
        text: canonical,
        wordStartIndex: findWordStartIndex(words, canonical),
      };
      const key = segmentMatchKey(match);
      if (seen.has(key)) continue;
      seen.add(key);
      supplements.push(match);
    }
  }

  return supplements;
}

/**
 * Segments one description: phrase matches plus grammar supplements for missed synonyms.
 * Path keeps every matched token, including multiple values from the same category.
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

  const phraseKept = phraseMatchList.filter((match) => canonicalTexts.has(match.text));
  const grammarMatches = grammarSupplementMatches(
    text,
    tokens,
    ordered,
    canonicalTexts,
    phraseKept,
  );

  const segments = orderSegmentsByCategories([...phraseKept, ...grammarMatches], ordered);
  const path = normalizeCompactPath(segments.join('.'));

  return {
    segments: path ? path.split('.') : segments,
    path,
    unmatched: [...new Set(unmatched)],
  };
}
