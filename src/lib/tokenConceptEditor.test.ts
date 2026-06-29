/**
 * Tests for canonical concept editor line parse/apply.
 */
import { describe, expect, it } from 'vitest';
import type { TokenCategory } from './dictionaryTree';
import { NO_CATEGORY_SENTINEL } from './dictionaryTree';
import {
  applyCanonicalConceptEdit,
  applyNewConceptLine,
  formatConceptEditorLine,
  listAliasesForCanonical,
  parseConceptEditorLine,
} from './tokenConceptEditor';
import type { TokenEntry } from './tokenDictionary';

const categories: TokenCategory[] = [
  { id: 'c1', name: 'tipo visita', order: 0, tokenTexts: ['prima', 'controllo'] },
];

const tokens: TokenEntry[] = [
  { text: 'prima', enabled: true },
  { text: 'controllo', enabled: true },
];

describe('parseConceptEditorLine', () => {
  it('parses canonical only', () => {
    expect(parseConceptEditorLine('prima')).toEqual({ canonical: 'prima', aliases: [] });
    expect(parseConceptEditorLine('prima:')).toEqual({ canonical: 'prima', aliases: [] });
  });

  it('parses canonical with comma-separated aliases', () => {
    expect(parseConceptEditorLine('prima: PRIMA, visita specialistica')).toEqual({
      canonical: 'prima',
      aliases: ['visita specialistica'],
    });
  });

  it('skips alias equal to canonical', () => {
    expect(parseConceptEditorLine('prima: prima, syn')).toEqual({
      canonical: 'prima',
      aliases: ['syn'],
    });
  });
});

describe('formatConceptEditorLine', () => {
  it('omits colon when no aliases', () => {
    expect(formatConceptEditorLine('prima', [])).toBe('prima');
  });

  it('joins aliases after colon', () => {
    expect(formatConceptEditorLine('prima', ['syn a', 'syn b'])).toBe('prima: syn a, syn b');
  });
});

describe('applyCanonicalConceptEdit', () => {
  it('adds aliases to existing canonical', () => {
    const result = applyCanonicalConceptEdit(
      tokens,
      categories,
      'prima',
      'prima: visita specialistica',
    );
    expect(result.canonical).toBe('prima');
    expect(listAliasesForCanonical(result.tokens, 'prima')).toEqual(['visita specialistica']);
  });

  it('renames canonical and updates categories', () => {
    const result = applyCanonicalConceptEdit(
      [...tokens, { text: 'syn', enabled: true, aliasOf: 'prima' }],
      categories,
      'prima',
      'prima visita: syn',
    );
    expect(result.canonical).toBe('prima visita');
    expect(result.categories[0]?.tokenTexts).toContain('prima visita');
    expect(result.categories[0]?.tokenTexts).not.toContain('prima');
    expect(listAliasesForCanonical(result.tokens, 'prima visita')).toEqual(['syn']);
  });

  it('reports category when alias conflicts with an existing canonical', () => {
    const multiCategories: TokenCategory[] = [
      { id: 'c1', name: 'esame', order: 0, tokenTexts: ['ecg'] },
      { id: 'c2', name: 'altro', order: 1, tokenTexts: ['elettrocardiogramma'] },
    ];
    const multiTokens: TokenEntry[] = [
      { text: 'ecg', enabled: true },
      { text: 'elettrocardiogramma', enabled: true },
    ];
    expect(() => applyCanonicalConceptEdit(
      multiTokens,
      multiCategories,
      'ecg',
      'ecg: elettrocardiogramma',
    )).toThrow('"elettrocardiogramma" è già un token canonico nella categoria «altro»');
  });
});

describe('applyNewConceptLine', () => {
  it('creates canonical with aliases in category', () => {
    const result = applyNewConceptLine(
      tokens,
      categories,
      'c1',
      'revisione: revisione specialistica',
    );
    expect(result.canonical).toBe('revisione');
    expect(result.categories[0]?.tokenTexts).toContain('revisione');
    expect(listAliasesForCanonical(result.tokens, 'revisione')).toEqual(['revisione specialistica']);
  });

  it('rejects duplicate in the same category', () => {
    expect(() => applyNewConceptLine(tokens, categories, 'c1', 'prima')).toThrow(
      '«prima» è già in questa categoria',
    );
  });

  it('moves an existing canonical from another category with notice', () => {
    const multiCategories: TokenCategory[] = [
      { id: 'c1', name: 'tipo visita', order: 0, tokenTexts: ['controllo'] },
      { id: 'c2', name: 'Teoria', order: 1, tokenTexts: ['prima'] },
    ];

    const moved = applyNewConceptLine(tokens, multiCategories, 'c1', 'prima');
    expect(moved.notice).toBe('«prima» spostato dalla categoria «Teoria»');
    expect(moved.categories.find((c) => c.id === 'c1')?.tokenTexts).toContain('prima');
    expect(moved.categories.find((c) => c.id === 'c2')?.tokenTexts).not.toContain('prima');
  });

  it('assigns an uncategorized canonical to the active category', () => {
    const loose: TokenEntry[] = [...tokens, { text: 'revisione', enabled: true }];
    const result = applyNewConceptLine(loose, categories, 'c1', 'revisione');
    expect(result.categories[0]?.tokenTexts).toContain('revisione');
  });

  it('rejects duplicate at dictionary root', () => {
    const rootTokens: TokenEntry[] = [{ text: 'orfano', enabled: true }];
    expect(() => applyNewConceptLine(rootTokens, categories, NO_CATEGORY_SENTINEL, 'orfano')).toThrow(
      'senza categoria',
    );
  });
});
