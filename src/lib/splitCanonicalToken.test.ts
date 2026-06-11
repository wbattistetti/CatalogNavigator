/**
 * Tests for canonical token split.
 */
import { describe, expect, it } from 'vitest';
import { applyCanonicalTokenSplit, splitPartsFromTokenSelection } from './splitCanonicalToken';
import type { TokenCategory } from './dictionaryTree';
import type { TokenEntry } from './tokenDictionary';

const categories: TokenCategory[] = [
  { id: 'c1', name: 'tipo', order: 0, tokenTexts: ['ecg da 0 fino a 1 anno'] },
  { id: 'c2', name: 'fascia', order: 1, tokenTexts: [] },
];

const tokens: TokenEntry[] = [
  { text: 'ecg da 0 fino a 1 anno', enabled: true },
];

describe('splitPartsFromTokenSelection', () => {
  it('splits prefix selection into head and tail', () => {
    const source = 'ecg da 0 fino a 1 anno';
    const headEnd = source.indexOf('da');
    const parts = splitPartsFromTokenSelection(source, 0, headEnd);
    expect(parts.head).toBe('ecg');
    expect(parts.tail).toBe('da 0 fino a 1 anno');
  });

  it('rejects empty tail', () => {
    expect(() => splitPartsFromTokenSelection('ecg', 0, 3)).toThrow();
  });
});

describe('applyCanonicalTokenSplit', () => {
  it('replaces one token with two in the same category', () => {
    const result = applyCanonicalTokenSplit(tokens, categories, 'ecg da 0 fino a 1 anno', {
      head: 'ecg',
      tail: 'da 0 fino a 1 anno',
    });
    expect(result.tokens.map((t) => t.text).sort()).toEqual(['da 0 fino a 1 anno', 'ecg']);
    const cat = result.categories.find((c) => c.id === 'c1');
    expect(cat?.tokenTexts.sort()).toEqual(['da 0 fino a 1 anno', 'ecg']);
  });
});
