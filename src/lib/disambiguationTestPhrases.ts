/**
 * Helpers for disambiguation grammar test phrases (separate from synonyms).
 */
import type { DisambiguationTestPhrase } from './disambiguationPlanTypes';

export function testPhraseKey(phrase: string): string {
  return phrase.trim().toLowerCase();
}

export function sortTestPhrases(phrases: readonly DisambiguationTestPhrase[]): DisambiguationTestPhrase[] {
  return [...phrases].sort((a, b) =>
    a.phrase.localeCompare(b.phrase, 'it', { sensitivity: 'base' }),
  );
}

export function normalizeTestPhrases(
  phrases: readonly DisambiguationTestPhrase[] | null | undefined,
): DisambiguationTestPhrase[] {
  if (!phrases?.length) return [];
  const out: DisambiguationTestPhrase[] = [];
  for (const row of phrases) {
    const phrase = row.phrase?.trim();
    const expected = row.expected?.trim();
    if (!phrase || !expected) continue;
    out.push({ phrase, expected });
  }
  return sortTestPhrases(out);
}

export function findTestPhraseIndex(
  phrases: readonly DisambiguationTestPhrase[],
  phrase: string,
): number {
  const key = testPhraseKey(phrase);
  return phrases.findIndex((row) => testPhraseKey(row.phrase) === key);
}

export interface AddTestPhraseResult {
  phrases: DisambiguationTestPhrase[];
  /** Index of an existing row with the same phrase text. */
  duplicateIndex: number;
  /** Same phrase already mapped to a different expected option. */
  ambiguous: boolean;
}

/** Adds a test phrase or reports duplicate / cross-option ambiguity. */
export function addTestPhrase(
  phrases: readonly DisambiguationTestPhrase[],
  phrase: string,
  expected: string,
): AddTestPhraseResult {
  const trimmedPhrase = phrase.trim();
  const trimmedExpected = expected.trim();
  if (!trimmedPhrase || !trimmedExpected) {
    return { phrases: [...phrases], duplicateIndex: -1, ambiguous: false };
  }

  const idx = findTestPhraseIndex(phrases, trimmedPhrase);
  if (idx >= 0) {
    const existing = phrases[idx]!;
    if (existing.expected !== trimmedExpected) {
      return { phrases: [...phrases], duplicateIndex: idx, ambiguous: true };
    }
    return { phrases: [...phrases], duplicateIndex: idx, ambiguous: false };
  }

  return {
    phrases: sortTestPhrases([...phrases, { phrase: trimmedPhrase, expected: trimmedExpected }]),
    duplicateIndex: -1,
    ambiguous: false,
  };
}
