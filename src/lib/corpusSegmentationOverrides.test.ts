/**
 * Tests for per-row segmentation segment exclusions.
 */
import { describe, expect, it } from 'vitest';
import type { CorpusSegmentationEntry } from './corpusSegmentationCache';
import { addSegmentExclusion, applySegmentExclusions, applyExclusionsToRow } from './corpusSegmentationOverrides';

const baseEntry: CorpusSegmentationEntry = {
  segments: [
    { text: 'angiologica', dictionaryId: 'd1' },
    { text: '> 17 anni', dictionaryId: 'd1' },
    { text: 'ecodoppler', dictionaryId: 'd1' },
  ],
  path: 'angiologica.> 17 anni.ecodoppler',
  unmatched: ['extra'],
};

describe('applySegmentExclusions', () => {
  it('returns the same entry when no exclusions', () => {
    expect(applySegmentExclusions(baseEntry, new Set())).toBe(baseEntry);
  });

  it('removes a segment from path and adds its words to unmatched', () => {
    const result = applySegmentExclusions(baseEntry, new Set(['ecodoppler']));
    expect(result.segments.map((s) => s.text)).toEqual(['angiologica', '> 17 anni']);
    expect(result.path).toBe('angiologica.> 17 anni');
    expect(result.unmatched).toContain('extra');
    expect(result.unmatched).toContain('ecodoppler');
  });

  it('removes only one occurrence when keyed with @index', () => {
    const entry: CorpusSegmentationEntry = {
      segments: [
        { text: 'prima', dictionaryId: 'd1' },
        { text: 'prima', dictionaryId: 'd1' },
        { text: 'ecg', dictionaryId: 'd1' },
      ],
      path: 'prima.prima.ecg',
      unmatched: [],
    };
    const result = applySegmentExclusions(entry, new Set(['prima@2']));
    expect(result.segments.map((s) => s.text)).toEqual(['prima', 'ecg']);
    expect(result.path).toBe('prima.ecg');
  });

  it('tokenizes multi-word removed segments into unmatched words', () => {
    const result = applySegmentExclusions(baseEntry, new Set(['> 17 anni']));
    expect(result.segments.map((s) => s.text)).toEqual(['angiologica', 'ecodoppler']);
    expect(result.path).toBe('angiologica.ecodoppler');
    expect(result.unmatched).toEqual(expect.arrayContaining(['extra', '17', 'anni']));
  });

  it('clears path when all segments are excluded', () => {
    const result = applySegmentExclusions(
      baseEntry,
      new Set(['angiologica', '> 17 anni', 'ecodoppler']),
    );
    expect(result.segments).toEqual([]);
    expect(result.path).toBe('');
    expect(result.unmatched.length).toBeGreaterThan(0);
  });
});

describe('applyExclusionsToRow', () => {
  it('updates row path and unmatched', () => {
    const row: import('./tokenDictionary').RowSegmentation = {
      rowIndex: 0,
      sourceText: 'visita controllo prima',
      path: 'angiologica.controllo.prima',
      unmatched: [],
    };
    const next = applyExclusionsToRow(row, new Set(['prima']));
    expect(next.path).toBe('angiologica.controllo');
    expect(next.unmatched).toContain('prima');
  });
});

describe('addSegmentExclusion', () => {
  it('adds a segment text without mutating the original set', () => {
    const original = new Set(['a']);
    const next = addSegmentExclusion(original, 'b');
    expect(original.has('b')).toBe(false);
    expect([...next]).toEqual(['a', 'b']);
  });
});
