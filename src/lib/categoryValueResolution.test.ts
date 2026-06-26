/**
 * Tests for category value resolution (cardinality + winner).
 */
import { describe, expect, it } from 'vitest';
import type { TokenCategory } from './dictionaryTree';
import {
  applyCategoryResolutionToSegmentTexts,
  resolveAttributoValuesForCategory,
} from './categoryValueResolution';

const tipoVisita: TokenCategory = {
  id: 'tv',
  name: 'tipo visita',
  order: 1,
  tokenTexts: ['prima', 'controllo'],
  cardinality: 'single',
  winner: 'controllo',
};

const esame: TokenCategory = {
  id: 'ex',
  name: 'esame',
  order: 2,
  tokenTexts: ['ecg', 'ecocolordoppler cardiaco'],
  cardinality: 'multi',
};

describe('resolveAttributoValuesForCategory', () => {
  it('keeps multiple values for multi cardinality', () => {
    expect(
      resolveAttributoValuesForCategory(esame, ['ecg', 'ecocolordoppler cardiaco']),
    ).toEqual(['ecg', 'ecocolordoppler cardiaco']);
  });

  it('applies winner on single-cardinality conflict', () => {
    expect(
      resolveAttributoValuesForCategory(tipoVisita, ['prima', 'controllo']),
    ).toEqual(['controllo']);
  });

  it('throws when single conflict has no winner', () => {
    expect(() =>
      resolveAttributoValuesForCategory(
        { ...tipoVisita, winner: undefined },
        ['prima', 'controllo'],
      ),
    ).toThrow(/Violazione cardinalità/);
  });
});

describe('applyCategoryResolutionToSegmentTexts', () => {
  const categories: TokenCategory[] = [
    { id: 'sp', name: 'specialità', order: 0, tokenTexts: ['cardiologica'] },
    tipoVisita,
    esame,
  ];

  it('resolves tipo visita conflict and keeps multi esame', () => {
    const { segments, violations } = applyCategoryResolutionToSegmentTexts(
      ['cardiologica', 'prima', 'controllo', 'ecg', 'ecocolordoppler cardiaco'],
      categories,
    );
    expect(segments).toEqual([
      'cardiologica',
      'controllo',
      'ecg',
      'ecocolordoppler cardiaco',
    ]);
    expect(violations).toHaveLength(0);
  });

  it('reports violation when winner cannot resolve', () => {
    const cats: TokenCategory[] = [
      {
        ...tipoVisita,
        winner: undefined,
        tokenTexts: ['prima', 'controllo', 'revisione'],
      },
    ];
    const { violations } = applyCategoryResolutionToSegmentTexts(
      ['prima', 'revisione'],
      cats,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]?.categoryName).toBe('tipo visita');
  });
});
