/**
 * Tests for loading category tokens from tabular document columns.
 */
import { describe, expect, it } from 'vitest';
import { NO_CATEGORY_SENTINEL, type TokenCategory } from './dictionaryTree';
import {
  canLoadCategoryFromDocument,
  extractDistinctColumnValues,
  importableDocumentColumns,
  loadTokensFromColumnIntoCategory,
} from './loadCategoryFromDocumentColumn';
import type { ParsedTabular } from './parseTabular';
import type { TokenEntry } from './tokenDictionary';

const tabular: ParsedTabular = {
  headers: ['specialità', 'medico', 'note'],
  rows: [
    ['Cardiologia', 'Rossi', ''],
    ['cardiologia', 'Bianchi', 'x'],
    ['Neurologia', '', ''],
    ['', 'Verdi', ''],
    ['  Dermatologia  ', 'Neri', ''],
  ],
};

describe('importableDocumentColumns', () => {
  it('excludes columns marked ignore', () => {
    expect(importableDocumentColumns(['a', 'b', 'c'], { b: 'ignore' })).toEqual(['a', 'c']);
  });
});

describe('canLoadCategoryFromDocument', () => {
  it('is false without tabular data', () => {
    expect(canLoadCategoryFromDocument(null)).toBe(false);
    expect(canLoadCategoryFromDocument({ headers: ['a'], rows: [] })).toBe(false);
  });

  it('is false when every column is ignored', () => {
    expect(canLoadCategoryFromDocument(tabular, {
      specialità: 'ignore',
      medico: 'ignore',
      note: 'ignore',
    })).toBe(false);
  });

  it('is true for tabular with rows and importable columns', () => {
    expect(canLoadCategoryFromDocument(tabular)).toBe(true);
  });
});

describe('extractDistinctColumnValues', () => {
  it('deduplicates case-insensitively after normalization', () => {
    expect(extractDistinctColumnValues(tabular, 'specialità')).toEqual([
      'cardiologia',
      'dermatologia',
      'neurologia',
    ]);
  });

  it('skips empty cells', () => {
    expect(extractDistinctColumnValues(tabular, 'medico')).toEqual([
      'bianchi',
      'neri',
      'rossi',
      'verdi',
    ]);
  });

  it('returns empty for unknown column', () => {
    expect(extractDistinctColumnValues(tabular, 'missing')).toEqual([]);
  });

  it('returns empty when every cell is blank', () => {
    expect(extractDistinctColumnValues(tabular, 'note')).toEqual(['x']);
    expect(extractDistinctColumnValues(
      { headers: ['vuota'], rows: [[''], ['  ']] },
      'vuota',
    )).toEqual([]);
  });

  it('normalizes punctuation and casing like token entry', () => {
    const t: ParsedTabular = {
      headers: ['nome'],
      rows: [['  ECG + Holter  '], ['ecg + holter']],
    };
    expect(extractDistinctColumnValues(t, 'nome')).toEqual(['ecg +holter']);
  });
});

describe('loadTokensFromColumnIntoCategory', () => {
  const categories: TokenCategory[] = [
    { id: 'cat-spec', name: 'specialità', order: 0, tokenTexts: [] },
  ];
  const tokens: TokenEntry[] = [];

  it('throws for no category sentinel', () => {
    expect(() => loadTokensFromColumnIntoCategory(tokens, categories, NO_CATEGORY_SENTINEL, ['a']))
      .toThrow(/no category/i);
  });

  it('imports values into the target category', () => {
    const result = loadTokensFromColumnIntoCategory(
      tokens,
      categories,
      'cat-spec',
      ['cardiologia', 'neurologia'],
    );
    expect(result.importedCount).toBe(2);
    expect(result.categories[0]?.tokenTexts.sort()).toEqual(['cardiologia', 'neurologia']);
    expect(result.tokens.map((t) => t.text).sort()).toEqual(['cardiologia', 'neurologia']);
  });
});
