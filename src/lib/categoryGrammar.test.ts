/**
 * Tests for category-level grammar compilation and matching.
 */
import { describe, expect, it } from 'vitest';
import {
  compileCategoryGrammar,
  matchCategoryGrammar,
  applyCategoryGrammars,
  findCategoriesMissingGrammar,
} from './categoryGrammar';
import type { TokenCategory } from './dictionaryTree';
import type { TokenEntry } from './tokenDictionary';

const categories: TokenCategory[] = [
  {
    id: 'c1',
    name: 'specialità',
    order: 0,
    tokenTexts: ['cardiologica', 'dermatologica'],
    type: 'attributo',
  },
  {
    id: 'c2',
    name: 'esame',
    order: 1,
    tokenTexts: ['con ecg'],
    type: 'attributo',
  },
];

const tokens: TokenEntry[] = [
  { text: 'cardiologica', enabled: true },
  { text: 'dermatologica', enabled: true },
  { text: 'con ecg', enabled: true },
];

describe('compileCategoryGrammar', () => {
  it('builds one named group per canonical value', () => {
    const grammar = compileCategoryGrammar(categories[0]!, tokens);
    expect(grammar?.regex).toContain('cardiologica');
    expect(grammar?.regex).toContain('dermatologica');
    expect(Object.values(grammar!.mappings)).toContain('cardiologica');
    expect(Object.values(grammar!.mappings)).toContain('dermatologica');
  });

  it('matches utterance to canonical value via category grammar', () => {
    const withGrammar = applyCategoryGrammars(categories, tokens, true);
    const match = matchCategoryGrammar('visita cardiologica', withGrammar[0]!);
    expect(match?.canonicalValue).toBe('cardiologica');
  });
});

describe('findCategoriesMissingGrammar', () => {
  it('lists attributo categories without grammar', () => {
    expect(findCategoriesMissingGrammar(categories)).toEqual(['specialità', 'esame']);
    const ready = applyCategoryGrammars(categories, tokens, true);
    expect(findCategoriesMissingGrammar(ready)).toEqual([]);
  });

  it('auto-completes age vincolo via compileVincoloResolutionPipeline', () => {
    const withVincolo: TokenCategory[] = [
      ...categories,
      {
        id: 'c3',
        name: 'fascia di età',
        order: 2,
        tokenTexts: ['> 17 anni'],
        type: 'vincolo',
      },
    ];
    expect(findCategoriesMissingGrammar(withVincolo)).toEqual(['specialità', 'esame']);
    const ready = applyCategoryGrammars(withVincolo, tokens, true);
    expect(findCategoriesMissingGrammar(ready)).toEqual([]);
    const vincolo = ready.find((c) => c.name === 'fascia di età');
    expect(vincolo?.resolution?.engine).toBe('pipeline');
    expect(vincolo?.valueKind).toBe('age_years');
    expect(vincolo?.grammar).toBeNull();
  });
});
