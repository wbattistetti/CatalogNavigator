/**
 * Tests for multi-value concept set helpers.
 */
import { describe, expect, it } from 'vitest';
import {
  formatValueSetDisplay,
  getItemAttributoValues,
  parseValueSetKey,
  valueSetContainsAll,
  valueSetKey,
} from './valueSet';
import type { BundleCorpusItem } from './agentBundleTypes';

describe('valueSetKey', () => {
  it('normalizes order and dedupes', () => {
    expect(valueSetKey(['eco_doppler', 'ecg', 'ecg'])).toBe('ecg+eco_doppler');
  });

  it('returns none for empty sets', () => {
    expect(valueSetKey([])).toBe('none');
  });

  it('round-trips via parseValueSetKey', () => {
    const key = 'ecg+eco_doppler';
    expect(parseValueSetKey(key)).toEqual(['ecg', 'eco_doppler']);
    expect(valueSetKey(parseValueSetKey(key))).toBe(key);
  });
});

describe('valueSetContainsAll', () => {
  it('matches superset items for partial NLU mentions', () => {
    expect(valueSetContainsAll(['ecg', 'eco_doppler'], ['eco_doppler'])).toBe(true);
    expect(valueSetContainsAll(['ecg'], ['ecg'])).toBe(true);
    expect(valueSetContainsAll(['ecg'], ['ecg', 'eco_doppler'])).toBe(false);
  });
});

describe('formatValueSetDisplay', () => {
  it('joins multi-value keys for display', () => {
    expect(formatValueSetDisplay('ecg+eco_doppler')).toBe('ecg + eco_doppler');
  });
});

describe('getItemAttributoValues', () => {
  it('groups multiple segments for the same category', () => {
    const item: BundleCorpusItem = {
      path: 'cardiologica.prima.ecg.eco_doppler',
      sourceText: '',
      confirmationText: '',
      segments: [
        { text: 'cardiologica', categoryName: 'specialità', categoryType: 'attributo' },
        { text: 'prima', categoryName: 'tipo visita', categoryType: 'attributo' },
        { text: 'ecg', categoryName: 'esami', categoryType: 'attributo' },
        { text: 'eco_doppler', categoryName: 'esami', categoryType: 'attributo' },
      ],
      unmatched: [],
      constraints: [],
    };
    expect(getItemAttributoValues(item, 'esami')).toEqual(['ecg', 'eco_doppler']);
  });
});
