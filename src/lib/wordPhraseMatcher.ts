/**
 * Indexed multi-phrase word matcher — O(corpus words × bucket size) instead of O(phrases × words).
 */
import {
  corpusWordMatchesPhraseWord,
  stripAttachedPlusPrefix,
  type MatchPhraseLike,
  type WordSpanMatch,
} from './phraseMatchEngine';

function tokenizeToWords(text: string): string[] {
  return text.match(/\+[\p{L}\p{N}]+|[\p{L}\p{N}]+/gu) ?? [];
}

export interface IndexedMatchPhrase extends MatchPhraseLike {
  words: readonly string[];
  wordCount: number;
}

export interface WordPhraseMatcher {
  readonly phraseCount: number;
  findAll(words: readonly string[]): WordSpanMatch[];
}

function bucketKeysForFirstWord(firstWord: string): string[] {
  const keys = [firstWord];
  const stripped = stripAttachedPlusPrefix(firstWord);
  if (stripped !== firstWord) keys.push(stripped);
  return keys;
}

function lookupKeysForCorpusWord(corpusWord: string): string[] {
  const keys = [corpusWord];
  const stripped = stripAttachedPlusPrefix(corpusWord);
  if (stripped !== corpusWord) keys.push(stripped);
  return keys;
}

function wordsMatchParts(words: readonly string[], start: number, parts: readonly string[]): boolean {
  if (start + parts.length > words.length) return false;
  for (let j = 0; j < parts.length; j++) {
    if (!corpusWordMatchesPhraseWord(words[start + j]!, parts[j]!, j)) return false;
  }
  return true;
}

/** Pre-indexes phrases by first token for fast corpus scanning. */
export function buildWordPhraseMatcher(phrases: readonly MatchPhraseLike[]): WordPhraseMatcher {
  const indexed: IndexedMatchPhrase[] = [];
  const buckets = new Map<string, number[]>();

  for (const phrase of phrases) {
    const words = tokenizeToWords(phrase.phrase);
    if (words.length === 0) continue;

    const entry: IndexedMatchPhrase = {
      phrase: phrase.phrase,
      canonical: phrase.canonical,
      words,
      wordCount: words.length,
    };
    const phraseIndex = indexed.length;
    indexed.push(entry);

    for (const key of bucketKeysForFirstWord(words[0]!)) {
      const list = buckets.get(key);
      if (list) list.push(phraseIndex);
      else buckets.set(key, [phraseIndex]);
    }
  }

  function findAll(words: readonly string[]): WordSpanMatch[] {
    if (indexed.length === 0 || words.length === 0) return [];

    const out: WordSpanMatch[] = [];
    for (let i = 0; i < words.length; i++) {
      const seen = new Set<number>();
      for (const key of lookupKeysForCorpusWord(words[i]!)) {
        const bucket = buckets.get(key);
        if (!bucket) continue;

        for (const phraseIndex of bucket) {
          if (seen.has(phraseIndex)) continue;
          seen.add(phraseIndex);

          const entry = indexed[phraseIndex]!;
          if (i + entry.wordCount > words.length) continue;
          if (!wordsMatchParts(words, i, entry.words)) continue;

          out.push({
            wordStart: i,
            wordEnd: i + entry.wordCount,
            phrase: entry.phrase,
            canonical: entry.canonical,
            isAlias: entry.phrase !== entry.canonical,
          });
        }
      }
    }
    return out;
  }

  return { phraseCount: indexed.length, findAll };
}

const matcherCache = new WeakMap<readonly MatchPhraseLike[], WordPhraseMatcher>();

/** Reuses a matcher for the same phrases array reference (e.g. corpus build). */
export function getWordPhraseMatcher(phrases: readonly MatchPhraseLike[]): WordPhraseMatcher {
  const cached = matcherCache.get(phrases);
  if (cached) return cached;
  const matcher = buildWordPhraseMatcher(phrases);
  matcherCache.set(phrases, matcher);
  return matcher;
}
