/**
 * Word-span phrase matching: enumerate all candidates, shadow contained spans,
 * keep partial overlaps (e.g. a b + b c) without greedy consume order bias.
 */
import { getWordPhraseMatcher } from './wordPhraseMatcher';

/** Phrase matched in corpus text and its canonical token for path segmentation. */
export interface MatchPhraseLike {
  phrase: string;
  canonical: string;
}

/** A phrase matched against consecutive whole words in a tokenized row. */
export interface WordSpanMatch {
  wordStart: number;
  /** Exclusive end index in the word array. */
  wordEnd: number;
  phrase: string;
  canonical: string;
  isAlias: boolean;
}

/** Optional scoring metadata for multi-dictionary segmentation. */
export interface ScoredWordSpanMatch extends WordSpanMatch {
  score: number;
}

/** True when outer covers inner word indices and is strictly larger (or longer phrase at same span). */
export function wordSpanContains(outer: WordSpanMatch, inner: WordSpanMatch): boolean {
  if (outer.wordStart > inner.wordStart || outer.wordEnd < inner.wordEnd) return false;
  const outerLen = outer.wordEnd - outer.wordStart;
  const innerLen = inner.wordEnd - inner.wordStart;
  if (outerLen > innerLen) return true;
  if (outerLen < innerLen) return false;
  return outer.phrase.length > inner.phrase.length
    || (outer.phrase.length === inner.phrase.length && outer.phrase !== inner.phrase);
}

/** Drops matches strictly contained in a longer match at the same location. */
export function shadowContainedWordSpans<T extends WordSpanMatch>(candidates: T[]): T[] {
  return candidates.filter(
    (inner) => !candidates.some((outer) => outer !== inner && wordSpanContains(outer, inner)),
  );
}

/**
 * Keeps every match after containment shadowing; partial overlaps (e.g. a b + b c) are all kept.
 */
export function collectWordSpanMatchesAfterShadow<T extends WordSpanMatch>(candidates: T[]): T[] {
  return shadowContainedWordSpans(candidates).sort(
    (a, b) => a.wordStart - b.wordStart || a.wordEnd - b.wordEnd || a.phrase.localeCompare(b.phrase),
  );
}

function tokenizeToWords(text: string): string[] {
  return text.match(/\+[\p{L}\p{N}]+|[\p{L}\p{N}]+/gu) ?? [];
}

/** Removes a leading + attached to the first corpus word (+test → test). */
export function stripAttachedPlusPrefix(word: string): string {
  return word.startsWith('+') ? word.slice(1) : word;
}

/**
 * True when corpus and phrase words align at one position.
 * On the first word only, an attached + prefix is optional on either side.
 */
export function corpusWordMatchesPhraseWord(
  corpusWord: string,
  phraseWord: string,
  phraseWordIndex: number,
): boolean {
  if (corpusWord === phraseWord) return true;
  if (phraseWordIndex !== 0) return false;
  return stripAttachedPlusPrefix(corpusWord) === stripAttachedPlusPrefix(phraseWord);
}

/** Matches a dictionary phrase against consecutive tokenized corpus words. */
export function wordsMatchAtPhrase(words: readonly string[], start: number, phrase: string): boolean {
  const parts = tokenizeToWords(phrase);
  if (parts.length === 0 || start + parts.length > words.length) return false;
  return parts.every((w, i) => corpusWordMatchesPhraseWord(words[start + i]!, w, i));
}

function wordsMatchAt(words: string[], start: number, phrase: string): boolean {
  return wordsMatchAtPhrase(words, start, phrase);
}

/** Finds every whole-word phrase occurrence without consuming input. */
export function findAllWordSpanMatches(words: string[], phrases: MatchPhraseLike[]): WordSpanMatch[] {
  if (phrases.length === 0 || words.length === 0) return [];
  return getWordPhraseMatcher(phrases).findAll(words);
}

function matchScore(match: ScoredWordSpanMatch): number {
  return match.score;
}

/**
 * Picks a maximum-scoring non-overlapping cover (order-independent vs greedy scan).
 * Unmatched words are simply omitted from the returned list.
 */
export function selectNonOverlappingWordSpans<T extends WordSpanMatch & { score?: number }>(
  candidates: T[],
  wordCount: number,
): T[] {
  const shadowed = shadowContainedWordSpans(candidates);
  if (shadowed.length === 0 || wordCount === 0) return [];

  const scored: ScoredWordSpanMatch[] = shadowed.map((c) => ({
    ...c,
    score: c.score ?? (c.wordEnd - c.wordStart) * 1000 + c.phrase.length,
  }));

  const endingAt = new Map<number, ScoredWordSpanMatch[]>();
  for (const m of scored) {
    const list = endingAt.get(m.wordEnd) ?? [];
    list.push(m);
    endingAt.set(m.wordEnd, list);
  }

  type DpCell = { score: number; prev: number; pick: ScoredWordSpanMatch | null };
  const dp: DpCell[] = [{ score: 0, prev: -1, pick: null }];

  for (let end = 1; end <= wordCount; end++) {
    let best: DpCell = { score: dp[end - 1]!.score, prev: end - 1, pick: null };
    const options = endingAt.get(end) ?? [];
    for (const m of options) {
      const base = dp[m.wordStart]!;
      const total = base.score + matchScore(m);
      if (total > best.score) {
        best = { score: total, prev: m.wordStart, pick: m };
      }
    }
    dp[end] = best;
  }

  const chosen: ScoredWordSpanMatch[] = [];
  let pos = wordCount;
  while (pos > 0) {
    const cell = dp[pos]!;
    if (cell.pick) {
      chosen.push(cell.pick);
      pos = cell.prev;
    } else {
      pos = cell.prev;
    }
  }

  return chosen.reverse() as T[];
}

/** Character span containment for highlight shadowing. */
export function charSpanContains(
  outer: { start: number; end: number; entryText: string },
  inner: { start: number; end: number; entryText: string },
): boolean {
  if (outer.start > inner.start || outer.end < inner.end) return false;
  const outerLen = outer.end - outer.start;
  const innerLen = inner.end - inner.start;
  if (outerLen > innerLen) return true;
  if (outerLen < innerLen) return false;
  return outer.entryText.length > inner.entryText.length
    || (outer.entryText.length === inner.entryText.length && outer.entryText !== inner.entryText);
}

/** Drops highlight spans strictly contained in a longer span. */
export function shadowContainedCharSpans<T extends { start: number; end: number; entryText: string }>(
  candidates: T[],
): T[] {
  return candidates.filter(
    (inner) => !candidates.some((outer) => outer !== inner && charSpanContains(outer, inner)),
  );
}

/**
 * Keeps every highlight span after containment shadowing; partial overlaps are kept (multiple chips).
 */
export function collectHighlightSpansAfterShadow<T extends { start: number; end: number; entryText: string }>(
  candidates: T[],
): T[] {
  return shadowContainedCharSpans(candidates).sort(
    (a, b) => a.start - b.start || a.end - b.end || a.entryText.localeCompare(b.entryText),
  );
}

/** Partial overlap (not containment): spans share text but neither contains the other. */
export function charSpansPartiallyOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  if (a.start >= b.end || b.start >= a.end) return false;
  return !(a.start <= b.start && a.end >= b.end) && !(b.start <= a.start && b.end >= a.end);
}

/**
 * After containment shadowing, resolve partial overlaps preferring longer spans.
 */
export function resolveNonOverlappingCharSpans<T extends { start: number; end: number; entryText: string }>(
  candidates: T[],
): T[] {
  const shadowed = shadowContainedCharSpans(candidates);
  const sorted = [...shadowed].sort((a, b) => {
    const lenA = a.end - a.start;
    const lenB = b.end - b.start;
    if (lenB !== lenA) return lenB - lenA;
    return a.start - b.start;
  });

  const chosen: T[] = [];
  for (const c of sorted) {
    if (chosen.some((h) => charSpansPartiallyOverlap(h, c))) continue;
    chosen.push(c);
  }
  return chosen.sort((a, b) => a.start - b.start);
}
