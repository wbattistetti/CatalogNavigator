import { describe, expect, it } from 'vitest';
import { buildCategorizeTokensSnapshot } from './categorizeTokensContext';
import { validateCategorizeSuggestions } from './categorizeTokensAi';
import { applyCategorizeSuggestions } from './categorizeTokensApply';
import { segmentationCategorySignature, type TokenCategory } from './dictionaryTree';
import type { TokenEntry } from './tokenDictionary';

const categories: TokenCategory[] = [
  { id: 'c1', name: 'specialità', order: 0, tokenTexts: ['cardiologica'] },
  { id: 'c2', name: 'fascia di età', order: 1, tokenTexts: ['> 17 anni'] },
];

const tokens: TokenEntry[] = [
  { text: 'cardiologica', enabled: true },
  { text: '> 17 anni', enabled: true },
  { text: 'addominale', enabled: true },
];

describe('buildCategorizeTokensSnapshot', () => {
  it('builds full catalogation with corpus examples and uncategorized tokens', () => {
    const snapshot = buildCategorizeTokensSnapshot(
      tokens,
      categories,
      ['Visita cardiologica per paziente > 17 anni', 'Ecografia addominale'],
    );

    expect(snapshot.uncategorized.map((t) => t.token)).toEqual(['addominale']);
    expect(snapshot.catalogation.find((c) => c.id === 'c1')?.tokens).toContain('cardiologica');
    expect(snapshot.catalogation.find((c) => c.id === 'c1')?.corpusExamples.length).toBeGreaterThan(0);
    expect(snapshot.uncategorized[0]?.snippets.length).toBeGreaterThan(0);
  });
});

describe('segmentationCategorySignature', () => {
  it('ignores empty categories so adding one does not invalidate cache', () => {
    const before = segmentationCategorySignature(categories);
    const after = segmentationCategorySignature([
      ...categories,
      { id: 'c3', name: 'tipo visita', order: 2, tokenTexts: [] },
    ]);
    expect(after).toBe(before);
  });
});

describe('validateCategorizeSuggestions', () => {
  it('accepts only valid tokens, categories and confidence', () => {
    const uncategorized = new Set(['addominale']);
    const names = new Map([['c1', 'specialità'], ['c2', 'fascia di età']]);

    const result = validateCategorizeSuggestions(
      [
        { token: 'addominale', categoryId: 'c1', confidence: 0.8, reason: 'esame' },
        { token: 'cardiologica', categoryId: 'c1', confidence: 0.9 },
        { token: 'addominale', categoryId: 'bad', confidence: 0.9 },
        { token: 'fantasma', categoryId: 'c1', confidence: 0.9 },
        { token: 'addominale', categoryId: 'c1', confidence: 0.3 },
      ],
      uncategorized,
      names,
    );

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]?.token).toBe('addominale');
    expect(result.skippedTokens).toEqual([]);
  });
});

describe('applyCategorizeSuggestions', () => {
  it('moves accepted tokens into categories', () => {
    const next = applyCategorizeSuggestions(categories, tokens, [{
      token: 'addominale',
      categoryId: 'c1',
      categoryName: 'specialità',
      confidence: 0.85,
      reason: 'test',
    }]);

    expect(next.find((c) => c.id === 'c1')?.tokenTexts).toContain('addominale');
  });
});
