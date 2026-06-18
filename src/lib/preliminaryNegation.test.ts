/**
 * Tests preliminary negation: standalone "senza" before a token suppresses it;
 * "senza" inside a token phrase is not negation.
 */
import { describe, expect, it } from 'vitest';
import type { TokenCategory } from './dictionaryTree';
import type { KbDictionary } from './dictionaryLibrary';
import {
  buildLoadedRefs,
  findHighlightSpansFromLoadedRefs,
  segmentDescriptionMulti,
} from './multiDictionarySegment';
import { segmentDescription } from './tokenDictionary';
import {
  dropPreliminaryNegatedMatches,
  isPreliminaryNegationBeforeMatch,
} from './preliminaryNegation';
import type { WordSpanMatch } from './phraseMatchEngine';

function makeDict(
  id: string,
  categories: TokenCategory[],
  tokens: Array<{ text: string }>,
): KbDictionary {
  return {
    id,
    name: id,
    industry: 'healthcare',
    industry_custom: null,
    description: null,
    scope: id.startsWith('lib') ? 'library' : 'project',
    project_id: 'proj-1',
    icon_key: 'folder',
    icon_color: '#34d399',
    categories,
    tokens: tokens.map((t) => ({ text: t.text, enabled: true })),
    created_at: '',
    updated_at: '',
  };
}

describe('preliminaryNegation', () => {
  it('detects escluso immediately before a separate ecg token', () => {
    const words = ['over', '17', 'anni', 'escluso', 'ecg'];
    const matches: WordSpanMatch[] = [{
      wordStart: 4,
      wordEnd: 5,
      phrase: 'ecg',
      canonical: 'ecg',
      isAlias: false,
    }];
    expect(isPreliminaryNegationBeforeMatch(words, 4, matches)).toBe(true);
  });

  it('keeps escluso ecg when both words are the token phrase', () => {
    const words = ['cardiologica', 'over', '17', 'anni', 'escluso', 'ecg'];
    const matches: WordSpanMatch[] = [{
      wordStart: 4,
      wordEnd: 6,
      phrase: 'escluso ecg',
      canonical: 'escluso ecg',
      isAlias: false,
    }];
    expect(isPreliminaryNegationBeforeMatch(words, 4, matches)).toBe(false);
  });

  it('detects senza immediately before a separate token', () => {
    const words = ['visita', 'senza', 'escluso', 'ecg'];
    const matches: WordSpanMatch[] = [{
      wordStart: 2,
      wordEnd: 4,
      phrase: 'escluso ecg',
      canonical: 'escluso ecg',
      isAlias: false,
    }];
    expect(isPreliminaryNegationBeforeMatch(words, 2, matches)).toBe(true);
  });

  it('does not treat senza inside token senza contrasto as negation', () => {
    const words = ['tac', 'ginocchio', 'senza', 'contrasto'];
    const matches: WordSpanMatch[] = [{
      wordStart: 2,
      wordEnd: 4,
      phrase: 'senza contrasto',
      canonical: 'senza contrasto',
      isAlias: false,
    }];
    expect(isPreliminaryNegationBeforeMatch(words, 2, matches)).toBe(false);
  });

  it('dropPreliminaryNegatedMatches removes negated token only', () => {
    const words = ['prima', 'senza', 'escluso', 'ecg'];
    const matches: WordSpanMatch[] = [
      {
        wordStart: 0,
        wordEnd: 1,
        phrase: 'prima',
        canonical: 'prima',
        isAlias: false,
      },
      {
        wordStart: 2,
        wordEnd: 4,
        phrase: 'escluso ecg',
        canonical: 'escluso ecg',
        isAlias: false,
      },
    ];
    const kept = dropPreliminaryNegatedMatches(words, matches);
    expect(kept.map((m) => m.canonical)).toEqual(['prima']);
  });
});

describe('segmentDescriptionMulti with preliminary negation', () => {
  const categories: TokenCategory[] = [
    { id: 'c1', name: 'tipo', order: 0, tokenTexts: ['prima'] },
    { id: 'c2', name: 'esame', order: 1, tokenTexts: ['senza contrasto', 'escluso ecg'] },
  ];
  const dict = makeDict('proj', categories, [
    { text: 'prima' },
    { text: 'senza contrasto' },
    { text: 'escluso ecg' },
  ]);
  const loaded = buildLoadedRefs([dict], []);

  it('keeps token when senza is part of the entity', () => {
    const text = 'prima tac ginocchio senza contrasto';
    const result = segmentDescriptionMulti(text, loaded);
    expect(result.segments.map((s) => s.text)).toContain('senza contrasto');
    expect(result.segments.map((s) => s.text)).toContain('prima');
  });

  it('drops token when senza precedes it as standalone word', () => {
    const text = 'prima visita senza escluso ecg';
    const result = segmentDescriptionMulti(text, loaded);
    expect(result.segments.map((s) => s.text)).not.toContain('escluso ecg');
    expect(result.segments.map((s) => s.text)).toContain('prima');
    expect(result.unmatched).toContain('senza');
  });

  it('highlights match segmentation after negation', () => {
    const text = 'prima visita senza escluso ecg';
    const segmented = segmentDescriptionMulti(text, loaded).segments.map((s) => s.text);
    const highlighted = findHighlightSpansFromLoadedRefs(text, loaded).map((s) => s.canonical);
    expect(highlighted.sort()).toEqual(segmented.sort());
  });

  it('drops standalone ecg after escluso in parentheses', () => {
    const categories: TokenCategory[] = [
      { id: 'c1', name: 'specialità', order: 0, tokenTexts: ['cardiologica'] },
      { id: 'c2', name: 'esame', order: 1, tokenTexts: ['ecg', 'escluso ecg'] },
      { id: 'c3', name: 'fascia', order: 2, tokenTexts: ['over 17 anni'] },
    ];
    const dict = makeDict('proj', categories, [
      { text: 'cardiologica' },
      { text: 'ecg' },
      { text: 'escluso ecg' },
      { text: 'over 17 anni' },
    ]);
    const loaded = buildLoadedRefs([dict], []);
    const text = 'PRIMA VISITA CARDIOLOGICA OVER 17 ANNI (ESCLUSO ECG)';
    const result = segmentDescriptionMulti(text, loaded);
    expect(result.segments.map((s) => s.text)).not.toContain('ecg');
    const highlighted = findHighlightSpansFromLoadedRefs(text, loaded).map((s) => s.canonical);
    expect(highlighted).not.toContain('ecg');
  });

  it('keeps escluso ecg token when phrase matches as one entity', () => {
    const categories: TokenCategory[] = [
      { id: 'c1', name: 'esame', order: 0, tokenTexts: ['escluso ecg'] },
    ];
    const dict = makeDict('proj', categories, [{ text: 'escluso ecg' }]);
    const loaded = buildLoadedRefs([dict], []);
    const text = 'VISITA (ESCLUSO ECG)';
    const result = segmentDescriptionMulti(text, loaded);
    expect(result.segments.map((s) => s.text)).toContain('escluso ecg');
  });
});

describe('segmentDescription with preliminary negation', () => {
  const tokens = [
    { text: 'senza contrasto', enabled: true },
    { text: 'escluso ecg', enabled: true },
  ];

  it('single-dict path applies negation consistently', () => {
    const negated = segmentDescription('tac senza escluso ecg', tokens, []);
    expect(negated.segments).not.toContain('escluso ecg');

    const included = segmentDescription('tac senza contrasto', tokens, []);
    expect(included.segments).toContain('senza contrasto');
  });

  it('highlights uppercase corpus text (display casing preserved)', () => {
    const categories: TokenCategory[] = [
      { id: 'c1', name: 'tipo', order: 0, tokenTexts: ['certificato', 'idoneita'] },
    ];
    const dict = makeDict('proj', categories, [
      { text: 'certificato' },
      { text: 'idoneita' },
    ]);
    const loaded = buildLoadedRefs([dict], []);
    const text = "CERTIFICATO IDONEITA' ALLA PRATICA";
    const highlighted = findHighlightSpansFromLoadedRefs(text, loaded);
    expect(highlighted.map((s) => s.canonical).sort()).toEqual(['certificato', 'idoneita']);
  });
});
