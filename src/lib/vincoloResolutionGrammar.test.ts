/**
 * Tests for vincolo resolution grammar compilation.
 */
import { describe, expect, it } from 'vitest';
import {
  compileAgeYearsResolutionGrammar,
  compileVincoloResolutionGrammar,
  isAgeVincoloCategoryName,
} from './vincoloResolutionGrammar';
import type { TokenCategory } from './dictionaryTree';

describe('isAgeVincoloCategoryName', () => {
  it('recognizes fascia di età', () => {
    expect(isAgeVincoloCategoryName('fascia di età')).toBe(true);
    expect(isAgeVincoloCategoryName('FASCIA DI ETÀ (VINCOLO)')).toBe(true);
  });

  it('rejects non-age categories', () => {
    expect(isAgeVincoloCategoryName('specialità')).toBe(false);
  });
});

describe('compileVincoloResolutionGrammar', () => {
  const ageCategory: TokenCategory = {
    id: 'v1',
    name: 'fascia di età',
    order: 0,
    tokenTexts: ['> 17 anni'],
    type: 'vincolo',
  };

  it('builds detection regex for age vincolo', () => {
    const grammar = compileVincoloResolutionGrammar(ageCategory);
    expect(grammar?.regex).toContain('\\d{1,3}');
    expect(grammar?.mappings).toBeDefined();
  });

  it('compileAgeYearsResolutionGrammar validates', () => {
    expect(compileAgeYearsResolutionGrammar().regex.length).toBeGreaterThan(20);
  });
});
