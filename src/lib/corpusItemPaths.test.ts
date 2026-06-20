/**
 * Tests for corpus item path resolution with manual segment exclusions.
 */
import { describe, expect, it } from 'vitest';
import { resolveCorpusItemPathsFromRows } from './corpusItemPaths';
import type { RowSegmentation } from './tokenDictionary';

const rows: RowSegmentation[] = [
  {
    rowIndex: 0,
    sourceText: 'visita angiologica controllo prima',
    path: 'angiologica.> 17 anni.controllo.prima',
    unmatched: [],
  },
];

describe('resolveCorpusItemPathsFromRows', () => {
  it('drops excluded segments from compile paths', () => {
    const exclusions = new Map<string, Set<string>>([
      ['visita angiologica controllo prima', new Set(['prima'])],
    ]);
    const paths = resolveCorpusItemPathsFromRows(rows, {
      descriptions: ['visita angiologica controllo prima'],
      dictionary: { descriptionColumn: 'desc', tokens: [], categories: [] },
      segmentExclusions: exclusions,
    });
    expect(paths).toHaveLength(1);
    expect(paths[0]).not.toContain('prima');
    expect(paths[0]?.split('.')).toContain('controllo');
  });

  it('keeps shorter and longer paths from different corpus rows (no prefix pruning)', () => {
    const categories = [
      { id: 'c1', name: 'specialità', order: 0, tokenTexts: ['cardiologica'] },
      { id: 'c2', name: 'fascia di età', order: 1, tokenTexts: ['> 17 anni'], type: 'vincolo' as const },
      { id: 'c3', name: 'tipo visita', order: 2, tokenTexts: ['prima'] },
      { id: 'c4', name: 'prestazioni', order: 3, tokenTexts: ['ecg', 'ecocolordoppler', 'cardiaco'] },
    ];
    const cardiologicaRows: RowSegmentation[] = [
      {
        rowIndex: 0,
        sourceText: 'visita prima cardiologica over 17 anni',
        path: 'cardiologica.> 17 anni.prima',
        unmatched: [],
      },
      {
        rowIndex: 1,
        sourceText: 'visita prima cardiologica over 17 anni con ecg ed ecocolordoppler cardiaco',
        path: 'cardiologica.> 17 anni.prima.ecg.ecocolordoppler.cardiaco',
        unmatched: [],
      },
    ];
    const paths = resolveCorpusItemPathsFromRows(cardiologicaRows, {
      descriptions: cardiologicaRows.map((r) => r.sourceText),
      dictionary: { descriptionColumn: 'desc', tokens: [], categories },
    });
    expect(paths).toHaveLength(2);
    const sorted = [...paths].sort((a, b) => a.length - b.length);
    expect(sorted[0]).toBe('cardiologica.> 17 anni.prima');
    expect(sorted[1]?.startsWith(`${sorted[0]}.`)).toBe(true);
  });

  it('omits whole rows when itemExclusions contains sourceText', () => {
    const paths = resolveCorpusItemPathsFromRows(rows, {
      descriptions: ['visita angiologica controllo prima'],
      dictionary: { descriptionColumn: 'desc', tokens: [], categories: [] },
      itemExclusions: new Set(['visita angiologica controllo prima']),
    });
    expect(paths).toEqual([]);
  });
});
