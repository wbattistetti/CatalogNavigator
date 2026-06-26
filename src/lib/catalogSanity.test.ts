/**
 * Tests for catalog sanity analysis.
 */
import { describe, expect, it } from 'vitest';
import type { BundleCorpusItem } from './agentBundleTypes';
import {
  analyzeCatalogSanity,
  buildCatalogConceptFingerprint,
  catalogSanityWarnings,
} from './catalogSanity';

function item(
  path: string,
  segments: BundleCorpusItem['segments'],
  sourceText = path,
): BundleCorpusItem {
  return {
    path,
    sourceText,
    confirmationText: sourceText,
    segments,
    unmatched: [],
    constraints: [],
  };
}

describe('buildCatalogConceptFingerprint', () => {
  it('deduplicates repeated attributo tokens in fingerprint', () => {
    const fingerprint = buildCatalogConceptFingerprint(item('a.prima.prima.b', [
      { text: 'prima', categoryName: 'tipo visita', categoryType: 'attributo' },
      { text: 'prima', categoryName: 'tipo visita', categoryType: 'attributo' },
      { text: 'b', categoryName: 'esame', categoryType: 'attributo' },
    ]));
    expect(fingerprint).toContain('tipo visita=prima');
    expect(fingerprint).not.toContain('prima+prima');
  });
});

describe('analyzeCatalogSanity', () => {
  it('flags duplicate items with same catalog fingerprint', () => {
    const baseSegments = [
      { text: 'senologica', categoryName: 'specialità', categoryType: 'attributo' as const },
      { text: 'prima', categoryName: 'tipo visita', categoryType: 'attributo' as const },
      { text: 'ecografia', categoryName: 'esame', categoryType: 'attributo' as const },
      { text: 'mammografia', categoryName: 'esame', categoryType: 'attributo' as const },
    ];
    const report = analyzeCatalogSanity([
      item('senologica.prima.ecografia.mammografia', baseSegments, 'R69'),
      item('senologica.prima.ecografia.mammografia.alt', baseSegments, 'R113'),
    ]);
    expect(report.duplicates).toHaveLength(1);
    expect(report.duplicates[0]?.items).toHaveLength(2);
  });

  it('flags cardinality violations on single category without winner', () => {
    const categories = [
      {
        id: 'tv',
        name: 'tipo visita',
        order: 0,
        tokenTexts: ['prima', 'controllo'],
        cardinality: 'single' as const,
      },
    ];
    const report = analyzeCatalogSanity([
      item('angiologica.prima.controllo', [
        { text: 'angiologica', categoryName: 'specialità', categoryType: 'attributo' },
        { text: 'prima', categoryName: 'tipo visita', categoryType: 'attributo' },
        { text: 'controllo', categoryName: 'tipo visita', categoryType: 'attributo' },
      ], 'VISITA SPECIALISTICA DI CONTROLLO'),
    ], categories);
    expect(report.cardinalityViolations).toHaveLength(1);
    expect(report.cardinalityViolations[0]?.values).toEqual(['controllo', 'prima']);
  });

  it('flags repeated segment tokens before catalog dedup', () => {
    const report = analyzeCatalogSanity([
      item('senologica.prima.prima.ecografia', [
        { text: 'senologica', categoryName: 'specialità', categoryType: 'attributo' },
        { text: 'prima', categoryName: 'tipo visita', categoryType: 'attributo' },
        { text: 'prima', categoryName: 'tipo visita', categoryType: 'attributo' },
        { text: 'ecografia', categoryName: 'esame', categoryType: 'attributo' },
      ], 'successiva'),
    ]);
    expect(report.repeatedTokens).toHaveLength(1);
    expect(report.repeatedTokens[0]?.occurrenceIndices).toEqual([2, 3]);
    expect(report.repeatedTokens[0]?.collapsedCatalogKey).toBe('prima');
  });
});

describe('catalogSanityWarnings', () => {
  it('builds human-readable warnings', () => {
    const report = analyzeCatalogSanity([
      item('a.prima.prima', [
        { text: 'prima', categoryName: 'tipo visita', categoryType: 'attributo' },
        { text: 'prima', categoryName: 'tipo visita', categoryType: 'attributo' },
      ]),
    ]);
    const warnings = catalogSanityWarnings(report);
    expect(warnings.some((w) => w.includes('Token ripetuto'))).toBe(true);
  });
});
