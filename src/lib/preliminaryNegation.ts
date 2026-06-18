/**
 * Drops dictionary matches immediately preceded by a standalone negation word (e.g. "senza").
 * Negation inside the matched token phrase (e.g. token "senza contrasto") is not affected.
 */
import type { WordSpanMatch } from './phraseMatchEngine';

/** Lowercase negation / exclusion words before a separate token (not inside the token phrase). */
export const PRELIMINARY_NEGATION_WORDS = new Set([
  'senza',
  'non',
  'no',
  'escluso',
  'esclusa',
  'esclusi',
  'escluse',
]);

export function isPreliminaryNegationWord(word: string): boolean {
  return PRELIMINARY_NEGATION_WORDS.has(word.toLowerCase());
}

/**
 * True when wordStart is preceded by a negation word that is not the start of another match
 * (i.e. not consumed inside a token like "senza contrasto").
 */
export function isPreliminaryNegationBeforeMatch<T extends WordSpanMatch>(
  words: readonly string[],
  wordStart: number,
  allMatches: readonly T[],
): boolean {
  if (wordStart <= 0) return false;
  const prev = wordStart - 1;
  if (!isPreliminaryNegationWord(words[prev] ?? '')) return false;
  const negationConsumedByToken = allMatches.some((m) => m.wordStart === prev);
  return !negationConsumedByToken;
}

/** Removes matches negated by an immediate preliminary word (senza / non / escluso …). */
export function dropPreliminaryNegatedMatches<T extends WordSpanMatch>(
  words: readonly string[],
  matches: T[],
): T[] {
  return matches.filter(
    (m) => !isPreliminaryNegationBeforeMatch(words, m.wordStart, matches),
  );
}
