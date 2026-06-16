/**
 * Tests for canonical concept editor line parse/apply.
 */
import { describe, expect, it } from 'vitest';
import type { TokenCategory } from './dictionaryTree';
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
});
