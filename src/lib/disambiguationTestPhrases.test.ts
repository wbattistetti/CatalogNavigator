/**
 * Tests for disambiguation grammar test phrase helpers.
 */
import { describe, expect, it } from 'vitest';
import { addTestPhrase, normalizeTestPhrases, sortTestPhrases } from './disambiguationTestPhrases';

describe('disambiguationTestPhrases', () => {
  it('sorts phrases alphabetically', () => {
    expect(sortTestPhrases([
      { phrase: 'zeta', expected: 'ecg' },
      { phrase: 'alfa', expected: 'none' },
    ])).toEqual([
      { phrase: 'alfa', expected: 'none' },
      { phrase: 'zeta', expected: 'ecg' },
    ]);
  });

  it('adds a new phrase sorted', () => {
    const { phrases, duplicateIndex, ambiguous } = addTestPhrase(
      [{ phrase: 'alfa', expected: 'ecg' }],
      'beta',
      'none',
    );
    expect(ambiguous).toBe(false);
    expect(duplicateIndex).toBe(-1);
    expect(phrases).toEqual([
      { phrase: 'alfa', expected: 'ecg' },
      { phrase: 'beta', expected: 'none' },
    ]);
  });

  it('reports duplicate with same expected', () => {
    const initial = [{ phrase: 'sì', expected: 'ecg' }];
    const { duplicateIndex, ambiguous, phrases } = addTestPhrase(initial, 'sì', 'ecg');
    expect(duplicateIndex).toBe(0);
    expect(ambiguous).toBe(false);
    expect(phrases).toEqual(initial);
  });

  it('reports ambiguity when phrase maps to another expected', () => {
    const initial = [{ phrase: 'sì', expected: 'ecg' }];
    const { ambiguous, duplicateIndex } = addTestPhrase(initial, 'sì', 'none');
    expect(ambiguous).toBe(true);
    expect(duplicateIndex).toBe(0);
  });

  it('drops empty rows on normalize', () => {
    expect(normalizeTestPhrases([
      { phrase: '  ok  ', expected: 'ecg' },
      { phrase: ' ', expected: 'ecg' },
      { phrase: 'x', expected: '' },
    ])).toEqual([{ phrase: 'ok', expected: 'ecg' }]);
  });
});
