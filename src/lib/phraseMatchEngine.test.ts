/**
 * Tests for phrase match engine and segmentation order-independence.
 */
import assert from 'node:assert/strict';
import {
  collectWordSpanMatchesAfterShadow,
  findAllWordSpanMatches,
  shadowContainedWordSpans,
  wordSpanContains,
} from './phraseMatchEngine';
import {
  addToken,
  applySuppressionCascade,
  findHighlightSpans,
  getActiveMatchPhrases,
  normalizeTokenEntries,
  segmentWordsWithPositions,
} from './tokenDictionary';

function test(name: string, fn: () => void) {
  fn();
  console.log(`ok: ${name}`);
}

test('wordSpanContains detects strict containment', () => {
  const outer = { wordStart: 0, wordEnd: 3, phrase: 'a b c', canonical: 'a b c', isAlias: false };
  const inner = { wordStart: 0, wordEnd: 2, phrase: 'a b', canonical: 'a b', isAlias: false };
  assert.ok(wordSpanContains(outer, inner));
  assert.ok(!wordSpanContains(inner, outer));
});

test('shadowContainedWordSpans removes inner match', () => {
  const outer = { wordStart: 0, wordEnd: 3, phrase: 'a b c', canonical: 'a b c', isAlias: false };
  const inner = { wordStart: 0, wordEnd: 2, phrase: 'a b', canonical: 'a b', isAlias: false };
  const alsoInner = { wordStart: 1, wordEnd: 3, phrase: 'b c', canonical: 'b c', isAlias: false };
  const kept = shadowContainedWordSpans([outer, inner, alsoInner]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0]!.phrase, 'a b c');
});

test('segmentation is independent of phrase list order', () => {
  const tokens = applySuppressionCascade([
    { text: 'a b', enabled: true },
    { text: 'b c', enabled: true },
  ]);
  const words = ['a', 'b', 'c'];
  const forward = getActiveMatchPhrases(tokens);
  const reverse = [...forward].reverse();
  const segForward = segmentWordsWithPositions(words, forward);
  const segReverse = segmentWordsWithPositions(words, reverse);
  assert.deepEqual(
    segForward.matches.map((m) => m.text).sort(),
    segReverse.matches.map((m) => m.text).sort(),
  );
  assert.equal(segForward.matches.length, 2);
  assert.deepEqual(segForward.unmatched, []);
});

test('collectWordSpanMatchesAfterShadow keeps partial overlaps', () => {
  const words = ['a', 'b', 'c'];
  const phrases = [
    { phrase: 'a b', canonical: 'a b' },
    { phrase: 'b c', canonical: 'b c' },
  ];
  const candidates = findAllWordSpanMatches(words, phrases);
  assert.equal(candidates.length, 2);
  const selected = collectWordSpanMatchesAfterShadow(candidates);
  assert.equal(selected.length, 2);
  const covered = new Set<number>();
  for (const m of selected) {
    for (let i = m.wordStart; i < m.wordEnd; i++) covered.add(i);
  }
  assert.deepEqual([...covered].sort(), [0, 1, 2]);
});

test('addToken keeps short and long tokens enabled in dictionary', () => {
  let tokens = normalizeTokenEntries([
    { text: 'a b', enabled: true },
    { text: 'b c', enabled: true },
  ]);
  tokens = addToken(tokens, 'a b c');
  const abc = tokens.find((t) => t.text === 'a b c' && !t.aliasOf);
  const ab = tokens.find((t) => t.text === 'a b' && !t.aliasOf);
  assert.ok(abc?.enabled);
  assert.equal(ab?.enabled, true);
  assert.equal(ab?.suppressedBy, undefined);
  const phrases = getActiveMatchPhrases(tokens).map((p) => p.phrase);
  assert.ok(phrases.includes('a b'));
  assert.ok(phrases.includes('a b c'));
});

test('findHighlightSpans keeps partial overlap phrases', () => {
  const tokens = [
    { text: 'a b', enabled: true },
    { text: 'b c', enabled: true },
  ];
  const spans = findHighlightSpans('a b c', tokens);
  assert.equal(spans.length, 2);
});

test('findHighlightSpans shadows contained shorter phrase', () => {
  const tokens = [
    { text: 'a b c', enabled: true },
    { text: 'a b', enabled: true },
  ];
  const spans = findHighlightSpans('a b c', tokens);
  assert.equal(spans.length, 1);
});

console.log('all phrase match engine tests passed');
