/**
 * Tests for dictionary category layout helpers.
 */
import { describe, expect, it } from 'vitest';
import {
  compareTokenSegmentOrder,
  getCategoryTypeForToken,
  isLikelyConstraintCategoryName,
  loadSavedCategories,
  normalizeCategoryType,
  reorderCategoryToIndex,
  resolveCategoryTypeForExport,
  setCategoryType,
  normalizeCategoryOrders,
  type TokenCategory,
} from './dictionaryTree';

function cats(names: string[]): TokenCategory[] {
  return names.map((name, order) => ({
    id: `id-${order}`,
    name,
    order,
    tokenTexts: [],
  }));
}

describe('reorderCategoryToIndex', () => {
  it('moves a category up (insert before a higher row)', () => {
    const input = cats(['tipo', 'specialità', 'fascia', 'esame']);
    const result = reorderCategoryToIndex(input, 'id-2', 1);
    expect(result.map((c) => c.name)).toEqual(['tipo', 'fascia', 'specialità', 'esame']);
    expect(normalizeCategoryOrders(result).map((c) => c.order)).toEqual([0, 1, 2, 3]);
  });

  it('moves a category down (insert before a lower row)', () => {
    const input = cats(['tipo', 'specialità', 'fascia', 'esame']);
    const result = reorderCategoryToIndex(input, 'id-0', 3);
    expect(result.map((c) => c.name)).toEqual(['specialità', 'fascia', 'tipo', 'esame']);
  });

  it('appends at end when insertion index equals length', () => {
    const input = cats(['tipo', 'specialità', 'fascia']);
    const result = reorderCategoryToIndex(input, 'id-0', 3);
    expect(result.map((c) => c.name)).toEqual(['specialità', 'fascia', 'tipo']);
  });

  it('is a no-op when dropped in the same slot', () => {
    const input = cats(['tipo', 'specialità']);
    const result = reorderCategoryToIndex(input, 'id-1', 1);
    expect(result.map((c) => c.name)).toEqual(['tipo', 'specialità']);
  });
});

describe('compareTokenSegmentOrder', () => {
  it('orders vincolo by category.order like attributo', () => {
    const categories: TokenCategory[] = [
      { id: 'a', name: 'specialità', order: 0, tokenTexts: ['angiologica'] },
      { id: 'b', name: 'fascia di età', order: 1, tokenTexts: ['> 17 anni'], type: 'vincolo' },
      { id: 'c', name: 'parte', order: 2, tokenTexts: ['inferiori'] },
    ];
    expect(compareTokenSegmentOrder('angiologica', '> 17 anni', categories)).toBeLessThan(0);
    expect(compareTokenSegmentOrder('> 17 anni', 'inferiori', categories)).toBeLessThan(0);
    expect(compareTokenSegmentOrder('inferiori', '> 17 anni', categories)).toBeGreaterThan(0);
  });
});

describe('resolveCategoryTypeForExport', () => {
  it('infers vincolo from fascia di età name', () => {
    expect(isLikelyConstraintCategoryName('fascia di età')).toBe(true);
    expect(resolveCategoryTypeForExport({ name: 'fascia di età', type: 'attributo' })).toBe('vincolo');
  });

  it('keeps attributo for ordinary category names', () => {
    expect(resolveCategoryTypeForExport({ name: 'specialità', type: 'attributo' })).toBe('attributo');
  });
});

describe('category type', () => {
  it('defaults unknown or missing type to attributo', () => {
    expect(normalizeCategoryType(undefined)).toBe('attributo');
    expect(normalizeCategoryType('vincolo')).toBe('vincolo');
    expect(normalizeCategoryType('other')).toBe('attributo');
  });

  it('loads saved type and migrates legacy categories', () => {
    const loaded = loadSavedCategories({
      categories: [
        { id: 'a', name: 'tipo', order: 0, tokenTexts: ['tac'] },
        { id: 'b', name: 'età', order: 1, tokenTexts: ['14-17'], type: 'vincolo' },
      ],
    });
    expect(loaded[0]?.type).toBe('attributo');
    expect(loaded[1]?.type).toBe('vincolo');
  });

  it('resolves token category type', () => {
    const categories: TokenCategory[] = [
      { id: 'a', name: 'tipo', order: 0, tokenTexts: ['tac'], type: 'attributo' },
      { id: 'b', name: 'età', order: 1, tokenTexts: ['14-17'], type: 'vincolo' },
    ];
    expect(getCategoryTypeForToken('tac', categories)).toBe('attributo');
    expect(getCategoryTypeForToken('14-17', categories)).toBe('vincolo');
    expect(getCategoryTypeForToken('unknown', categories)).toBe('attributo');
  });

  it('updates category type immutably', () => {
    const categories: TokenCategory[] = [
      { id: 'a', name: 'età', order: 0, tokenTexts: [], type: 'attributo' },
    ];
    const next = setCategoryType(categories, 'a', 'vincolo');
    expect(next[0]?.type).toBe('vincolo');
    expect(categories[0]?.type).toBe('attributo');
  });
});
