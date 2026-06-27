/**
 * Tests for category-level grammar compilation and matching.
 */
import { describe, expect, it } from 'vitest';
import {
  applyCategoryGrammars,
  categoryTokenAssignmentChanged,
  clearCategoryGrammars,
  compileCategoryGrammar,
  ensureCategoryGrammarsCoverDictionaryAliases,
  findCategoriesMissingGrammar,
  categoryGrammarCoversDictionaryAliases,
  matchAllCategoryGrammarValues,
  matchCategoryGrammar,
  dropShadowedByLongerMatches,
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

  it('drops shorter token shadowed by a longer match in the same category', () => {
    const agonismoCategory: TokenCategory = {
      id: 'c-agonismo',
      name: 'pratica sportiva',
      order: 0,
      tokenTexts: ['non agonistica', 'agonistica'],
      type: 'attributo',
    };
    const agonismoTokens: TokenEntry[] = [
      { text: 'non agonistica', enabled: true },
      { text: 'agonistica', enabled: true },
    ];
    const withGrammar = applyCategoryGrammars([agonismoCategory], agonismoTokens, true);

    expect(dropShadowedByLongerMatches(['agonistica', 'non agonistica'])).toEqual([
      'non agonistica',
    ]);
    expect(matchAllCategoryGrammarValues(
      'certificato per attivita non agonistica con test',
      withGrammar[0]!,
      agonismoTokens,
    )).toEqual(['non agonistica']);
  });

  it('includes dictionary aliases in category grammar and matching', () => {
    const surgicalTokens: TokenEntry[] = [
      { text: 'chirurgia', enabled: true },
      { text: 'chirurgica', enabled: true, aliasOf: 'chirurgia' },
    ];
    const surgicalCategory: TokenCategory = {
      id: 'c-surg',
      name: 'specialità',
      order: 0,
      tokenTexts: ['chirurgia'],
      type: 'attributo',
    };
    const grammar = compileCategoryGrammar(surgicalCategory, surgicalTokens);
    expect(grammar?.regex).toContain('chirurgica');

    const withGrammar = applyCategoryGrammars([surgicalCategory], surgicalTokens, true);
    const match = matchCategoryGrammar('visita chirurgica', withGrammar[0]!, surgicalTokens);
    expect(match?.canonicalValue).toBe('chirurgia');
  });
});

describe('ensureCategoryGrammarsCoverDictionaryAliases', () => {
  it('recompiles only categories whose stored grammar misses dictionary aliases', () => {
    const tokens: TokenEntry[] = [
      { text: 'chirurgia', enabled: true },
      { text: 'chirurgica', enabled: true, aliasOf: 'chirurgia' },
    ];
    const staleCategory: TokenCategory = {
      id: 'c-surg',
      name: 'specialità',
      order: 0,
      tokenTexts: ['chirurgia'],
      type: 'attributo',
      grammar: {
        regex: '(?<chirurgia>chirurgia)',
        mappings: { chirurgia: 'chirurgia' },
      },
    };

    const next = ensureCategoryGrammarsCoverDictionaryAliases([staleCategory], tokens);
    expect(next[0]?.grammar?.regex).toContain('chirurgica');
    expect(
      matchCategoryGrammar('visita chirurgica', next[0]!, tokens)?.canonicalValue,
    ).toBe('chirurgia');
  });

  it('preserves stored grammar when aliases are already covered', () => {
    const tokens: TokenEntry[] = [
      { text: 'chirurgia', enabled: true },
      { text: 'chirurgica', enabled: true, aliasOf: 'chirurgia' },
    ];
    const fresh = applyCategoryGrammars([{
      id: 'c-surg',
      name: 'specialità',
      order: 0,
      tokenTexts: ['chirurgia'],
      type: 'attributo',
    }], tokens, true)[0]!;

    const input = [fresh];
    const next = ensureCategoryGrammarsCoverDictionaryAliases(input, tokens);
    expect(categoryGrammarCoversDictionaryAliases(fresh, tokens)).toBe(true);
    expect(next[0]?.grammar?.regex).toBe(fresh.grammar?.regex);
    expect(next).toBe(input);
    expect(next[0]).toBe(fresh);
  });

  it('preserves manual category grammar when no dictionary aliases are missing', () => {
    const tokens: TokenEntry[] = [{ text: 'cardiologica', enabled: true }];
    const manual: TokenCategory = {
      id: 'c1',
      name: 'specialità',
      order: 0,
      tokenTexts: ['cardiologica'],
      type: 'attributo',
      grammar: {
        regex: '(?<cardiologica>cardiologica|cardio)',
        mappings: { cardiologica: 'cardiologica' },
      },
    };

    const next = ensureCategoryGrammarsCoverDictionaryAliases([manual], tokens);
    expect(next[0]?.grammar?.regex).toBe('(?<cardiologica>cardiologica|cardio)');
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
