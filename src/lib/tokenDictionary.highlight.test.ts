/**
 * Regression tests for corpus highlight matching (e.g. "> 17 anni").
 */
import assert from 'node:assert/strict';
import {
  addToken,
  buildPhraseHighlightRegex,
  findHighlightSpans,
  getActiveMatchPhrases,
  normalizeTokenEntries,
  selectionToTokenPhrase,
  suggestLongerTokenInSource,
} from './tokenDictionary';

function test(name: string, fn: () => void) {
  fn();
  console.log(`ok: ${name}`);
}

test('buildPhraseHighlightRegex does not throw on > prefix', () => {
  const re = buildPhraseHighlightRegex('> 17 anni');
  assert.ok(re);
  assert.match('> 17 ANNI', re!);
});

test('selectionToTokenPhrase keeps leading >', () => {
  const source = '> 17 ANNI di sport';
  const range = { sourceText: source, start: 2, end: 9 };
  assert.equal(selectionToTokenPhrase('17 ANNI', range), '> 17 anni');
});

test('findHighlightSpans matches > 17 anni token', () => {
  let tokens = addToken([], '17 ANNI', { sourceText: '> 17 ANNI', start: 2, end: 9 });
  assert.equal(tokens.find((t) => !t.aliasOf)?.text, '> 17 anni');
  const spans = findHighlightSpans('> 17 ANNI', tokens);
  assert.equal(spans.length, 1, `expected 1 span, got ${spans.length}`);
  assert.equal('> 17 ANNI'.slice(spans[0]!.start, spans[0]!.end), '> 17 ANNI');
});

test('findHighlightSpans with nbsp after >', () => {
  const text = '>\u00a017 ANNI';
  const tokens = normalizeTokenEntries([{ text: '> 17 anni', enabled: true }]);
  const spans = findHighlightSpans(text, tokens);
  assert.equal(spans.length, 1, `expected 1 span, got ${spans.length}`);
});

test('findHighlightSpans with fullwidth >', () => {
  const text = '\uFF1E 17 ANNI';
  const tokens = normalizeTokenEntries([{ text: '> 17 anni', enabled: true }]);
  const spans = findHighlightSpans(text, tokens);
  assert.ok(spans.length >= 1, 'should match words even if marker differs');
});

test('selectionToTokenPhrase keeps attached + prefix', () => {
  const source = 'visita +ECG programmata';
  const range = { sourceText: source, start: 8, end: 11 };
  assert.equal(selectionToTokenPhrase('ECG', range), '+ecg');
});

test('selectionToTokenPhrase keeps +ecg when selected whole', () => {
  const source = 'visita +ECG programmata';
  const range = { sourceText: source, start: 7, end: 11 };
  assert.equal(selectionToTokenPhrase('+ECG', range), '+ecg');
});

test('findHighlightSpans matches +ecg token', () => {
  const tokens = normalizeTokenEntries([{ text: '+ecg', enabled: true }]);
  const spans = findHighlightSpans('visita +ECG domani', tokens);
  assert.equal(spans.length, 1);
  assert.equal('visita +ECG domani'.slice(spans[0]!.start, spans[0]!.end).toLowerCase(), '+ecg');
});

test('buildPhraseHighlightRegex matches attached +ecg', () => {
  assert.match('+ECG', buildPhraseHighlightRegex('+ecg')!);
  assert.match('+ ECG', buildPhraseHighlightRegex('+ecg')!);
});

test('suggestLongerTokenInSource when row contains longer phrase', () => {
  const tokens = normalizeTokenEntries([
    { text: 'dietologica', enabled: true },
    { text: 'dietologica di nutrizione clinica', enabled: true },
  ]);
  const source = 'DIETOLOGICA DI NUTRIZIONE CLINICA';
  const range = { sourceText: source, start: 0, end: 11 };
  assert.equal(
    suggestLongerTokenInSource('dietologica', source, range, tokens),
    'dietologica di nutrizione clinica',
  );
});

test('suggestLongerTokenInSource returns null when longer token not in row', () => {
  const tokens = normalizeTokenEntries([
    { text: 'dietologica', enabled: true },
    { text: 'dietologica di nutrizione clinica', enabled: true },
  ]);
  const source = 'DIETOLOGICA "KYMINASI DIET"';
  const range = { sourceText: source, start: 0, end: 11 };
  assert.equal(suggestLongerTokenInSource('dietologica', source, range, tokens), null);
});

test('short and long tokens both stay enabled; shadowing is match-time only', () => {
  const tokens = normalizeTokenEntries([
    { text: 'dietologica', enabled: true },
    { text: 'dietologica di nutrizione clinica', enabled: true },
  ]);
  const diet = tokens.find((t) => t.text === 'dietologica' && !t.aliasOf);
  assert.equal(diet?.enabled, true);
  assert.equal(diet?.suppressedBy, undefined);

  const shortRow = findHighlightSpans('DIETOLOGICA "KYMINASI DIET"', tokens);
  assert.ok(
    shortRow.some((s) => s.canonical === 'dietologica'),
    'dietologica alone should chip on short rows',
  );

  const longRow = findHighlightSpans('DIETOLOGICA DI NUTRIZIONE CLINICA', tokens);
  assert.equal(
    longRow.filter((s) => s.canonical === 'dietologica di nutrizione clinica').length,
    1,
  );
  assert.ok(!longRow.some((s) => s.canonical === 'dietologica' && s.entryText === 'dietologica'));
});

test('merged highlight tokens stay active for > 17 anni', () => {
  const editing = normalizeTokenEntries(addToken([], '17 ANNI', {
    sourceText: '> 17 ANNI',
    start: 2,
    end: 9,
  }));
  const loaded = normalizeTokenEntries([
    { text: 'associato alla 1 visita', enabled: true },
    { text: '17 anni', enabled: true },
  ]);
  const byText = new Map<string, (typeof editing)[0]>();
  for (const t of loaded) byText.set(t.text, t);
  for (const t of editing) byText.set(t.text, t);
  const merged = [...byText.values()];
  const phrases = getActiveMatchPhrases(merged).map((p) => p.phrase);
  assert.ok(phrases.includes('> 17 anni'), `phrases: ${phrases.join(', ')}`);
  const spans = findHighlightSpans('> 17 ANNI', merged);
  assert.equal(spans.length, 1);
});

console.log('all highlight tests passed');
