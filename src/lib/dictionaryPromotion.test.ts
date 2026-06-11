/**
 * Tests for dictionary promotion and category extraction.
 */
import { describe, expect, it } from 'vitest';
import {
  extractCategoryFromSource,
  mergeCategoryIntoTarget,
  tokensForCategory,
  validateLibraryDictionaryName,
} from './dictionaryPromotion';
import type { TokenCategory } from './dictionaryTree';
import type { TokenEntry } from './tokenDictionary';

const categories: TokenCategory[] = [
  {
    id: 'c1',
    name: 'specialità',
    order: 0,
    tokenTexts: ['cardiologia', 'neurologia'],
    iconKey: 'Building2',
    iconColor: '#a78bfa',
  },
  {
    id: 'c2',
    name: 'esami',
    order: 1,
    tokenTexts: ['emocromo'],
  },
];

const tokens: TokenEntry[] = [
  { text: 'cardiologia', enabled: true },
  { text: 'cardio visita', enabled: true, aliasOf: 'cardiologia' },
  { text: 'neurologia', enabled: true },
  { text: 'emocromo', enabled: true },
  { text: 'orfano', enabled: true },
];

describe('validateLibraryDictionaryName', () => {
  it('trims and accepts valid names', () => {
    expect(validateLibraryDictionaryName('  Samp  ')).toBe('Samp');
  });

  it('rejects empty names', () => {
    expect(() => validateLibraryDictionaryName('   ')).toThrow(/obbligatorio/i);
  });

  it('rejects the reserved Project label', () => {
    expect(() => validateLibraryDictionaryName('Project')).toThrow(/Project/i);
    expect(() => validateLibraryDictionaryName('project')).toThrow(/Project/i);
  });
});

describe('tokensForCategory', () => {
  it('includes canonical tokens and aliases', () => {
    const moved = tokensForCategory(tokens, categories[0]!);
    expect(moved.map((t) => t.text).sort()).toEqual(['cardio visita', 'cardiologia', 'neurologia']);
  });
});

describe('extractCategoryFromSource', () => {
  it('removes category and related tokens from source', () => {
    const result = extractCategoryFromSource(tokens, categories, 'c1');
    expect(result.sourceTokens.map((t) => t.text)).toEqual(['emocromo', 'orfano']);
    expect(result.sourceCategories.map((c) => c.name)).toEqual(['esami']);
    expect(result.movedCategory.name).toBe('specialità');
    expect(result.movedTokens).toHaveLength(3);
  });
});

describe('mergeCategoryIntoTarget', () => {
  it('adds a new category when names differ', () => {
    const merged = mergeCategoryIntoTarget(
      [],
      [],
      { id: 'x', name: 'specialità', order: 0, tokenTexts: ['cardiologia'] },
      [{ text: 'cardiologia', enabled: true }],
    );
    expect(merged.categories).toHaveLength(1);
    expect(merged.tokens).toHaveLength(1);
  });

  it('merges token lists into an existing same-named category', () => {
    const merged = mergeCategoryIntoTarget(
      [{ text: 'cardiologia', enabled: true }],
      [{ id: 'c1', name: 'Specialità', order: 0, tokenTexts: ['cardiologia'] }],
      { id: 'x', name: 'specialità', order: 0, tokenTexts: ['neurologia'] },
      [{ text: 'neurologia', enabled: true }],
    );
    expect(merged.categories[0]?.tokenTexts.sort()).toEqual(['cardiologia', 'neurologia']);
  });
});
