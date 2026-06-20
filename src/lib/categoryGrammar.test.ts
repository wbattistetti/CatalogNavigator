/**
 * Tests for category-level grammar compilation and matching.
 */
import { describe, expect, it } from 'vitest';
import {
  applyCategoryGrammars,
  categoryTokenAssignmentChanged,
  clearCategoryGrammars,
  compileCategoryGrammar,
  findCategoriesMissingGrammar,
  matchAllCategoryGrammarValues,
  matchCategoryGrammar,
  reconcileCategoryGrammarsWithTokens,
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

  it('matches every canonical value that appears in the text', () => {
    const withGrammar = applyCategoryGrammars(categories, tokens, true);
    const specialita = withGrammar[0]!;
    expect(matchAllCategoryGrammarValues(
      'visita cardiologica e dermatologica',
      specialita,
      tokens,
    )).toEqual(['cardiologica', 'dermatologica']);
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

describe('categoryTokenAssignmentChanged', () => {
  it('detects token moved between categories', () => {
    const moved: TokenCategory[] = [
      { ...categories[0]!, tokenTexts: ['dermatologica'] },
      { ...categories[1]!, tokenTexts: ['con ecg', 'cardiologica'] },
    ];
    expect(categoryTokenAssignmentChanged(categories, moved)).toBe(true);
  });

  it('ignores manual grammar edits', () => {
    const withGrammar = applyCategoryGrammars(categories, tokens, true);
    const edited = withGrammar.map((cat, i) => (
      i === 0
        ? { ...cat, grammar: { regex: '(?<x>custom)', mappings: { x: 'cardiologica' } } }
        : cat
    ));
    expect(categoryTokenAssignmentChanged(withGrammar, edited)).toBe(false);
  });
});

describe('reconcileCategoryGrammarsWithTokens', () => {
  it('removes stale grammar patterns after token reassignment', () => {
    const bodyPart: TokenCategory = {
      id: 'body',
      name: 'parte del corpo',
      order: 0,
      tokenTexts: ['arti inferiori', 'addome'],
      type: 'attributo',
    };
    const district: TokenCategory = {
      id: 'dist',
      name: 'distretti anatomici',
      order: 1,
      tokenTexts: [],
      type: 'attributo',
    };
    const localTokens: TokenEntry[] = [
      { text: 'arti inferiori', enabled: true },
      { text: 'addome', enabled: true },
    ];
    const withGhost = applyCategoryGrammars([bodyPart, district], localTokens, true);
    expect(matchCategoryGrammar('arti inferiori', withGhost[0]!, localTokens)?.canonicalValue)
      .toBe('arti inferiori');

    const moved: TokenCategory[] = [
      { ...bodyPart, tokenTexts: ['addome'] },
      { ...district, tokenTexts: ['arti inferiori'] },
    ];
    const reconciled = reconcileCategoryGrammarsWithTokens(moved, localTokens);

    expect(matchCategoryGrammar('arti inferiori', reconciled[0]!, localTokens)).toBeNull();
    expect(matchCategoryGrammar('arti inferiori', reconciled[1]!, localTokens)?.canonicalValue)
      .toBe('arti inferiori');
  });
});

describe('clearCategoryGrammars', () => {
  it('nulls all grammars then rebuild produces only current tokenTexts', () => {
    const withGrammar = applyCategoryGrammars(categories, tokens, true);
    expect(withGrammar[0]?.grammar?.regex).toContain('cardiologica');

    const stale = withGrammar.map((cat, i) => (
      i === 0
        ? {
          ...cat,
          tokenTexts: ['dermatologica'],
          grammar: {
            regex: '(?<cardiologica>cardiologica|cardio)|(?<dermatologica>dermatologica)',
            mappings: { cardiologica: 'cardiologica', dermatologica: 'dermatologica' },
          },
        }
        : cat
    ));
    expect(stale[0]?.grammar?.regex).toContain('cardiologica');

    const cleared = clearCategoryGrammars(stale);
    expect(cleared.every((cat) => cat.grammar == null)).toBe(true);

    const rebuilt = applyCategoryGrammars(cleared, tokens, true);
    expect(rebuilt[0]?.grammar?.regex).not.toContain('cardiologica');
    expect(rebuilt[0]?.grammar?.regex).toContain('dermatologica');
    expect(findCategoriesMissingGrammar(rebuilt)).toEqual([]);
  });
});
