/**
 * Tests for VB parsed concept normalization.
 */
import { describe, expect, it } from 'vitest';
import { normalizeVbParsedEntry, normalizeVbParsedList } from './vbParsedNormalize';

describe('normalizeVbParsedEntry', () => {
  it('joins values array from VB engine', () => {
    expect(normalizeVbParsedEntry({
      category: 'esame',
      values: ['ecg', 'ecocolordoppler'],
    })).toEqual({
      category: 'esame',
      value: 'ecg+ecocolordoppler',
    });
  });

  it('falls back to singular value', () => {
    expect(normalizeVbParsedEntry({
      categoryName: 'esame',
      value: 'ecg',
    })).toEqual({
      category: 'esame',
      value: 'ecg',
    });
  });

  it('returns null when no values', () => {
    expect(normalizeVbParsedEntry({ category: 'esame', values: [] })).toBeNull();
  });
});

describe('normalizeVbParsedList', () => {
  it('normalizes all entries', () => {
    expect(normalizeVbParsedList([
      { category: 'esame', values: ['ecg'] },
      { category: 'specialità', value: 'cardiologica' },
    ])).toEqual([
      { category: 'esame', value: 'ecg' },
      { category: 'specialità', value: 'cardiologica' },
    ]);
  });
});
