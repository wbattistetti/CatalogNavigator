/**
 * Tests for corpus Glide row builder.
 */
import { describe, expect, it } from 'vitest';
import { buildCorpusGlidePreviewRows, buildCorpusGlideRows, buildCorpusGlideRowsFromCache, mergeExtraAnnotationsIntoGlideRowMap } from './buildCorpusGlideRows';

describe('buildCorpusGlidePreviewRows', () => {
  it('builds colored preview chips without dictionary lookup', () => {
    const rows = buildCorpusGlidePreviewRows([
      { rowIndex: 0, text: 'FARMACO · confezione · principio' },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.segPaints.length).toBe(3);
    expect(rows[0]?.segPaints[0]?.bgColor).toMatch(/^#[0-9a-f]{8}$/i);
  });
});

describe('buildCorpusGlideRowsFromCache', () => {
  it('builds inline description chips from cached segmentation positions', () => {
    const cacheLookup = (text: string) => ({
      segments: [{ text: 'IVERMECTINA', dictionaryId: 'farmaci' }],
      unmatched: [],
      path: 'IVERMECTINA',
    });

    const rows = buildCorpusGlideRowsFromCache(
      [{ rowIndex: 0, text: 'IVERMECTINA compresse' }],
      cacheLookup,
      [],
      null,
      [],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.segPaints).toHaveLength(1);
    expect(rows[0]?.segPaints[0]?.text).toBe('IVERMECTINA');
    expect(rows[0]?.descriptionRuns).toEqual([
      { kind: 'chip', text: 'IVERMECTINA', paint: expect.objectContaining({ text: 'IVERMECTINA' }) },
      { kind: 'text', text: ' compresse' },
    ]);
  });

  it('includes manual extra tokens in segmentation paints', () => {
    const cacheLookup = (text: string) => ({
      segments: [{ text: 'ECG', dictionaryId: 'farmaci' }],
      unmatched: [],
      path: 'ECG',
    });

    const rows = buildCorpusGlideRowsFromCache(
      [{ rowIndex: 0, text: 'ECG a riposo' }],
      cacheLookup,
      [],
      null,
      [],
      new Map([[0, ['esame']]]),
    );

    expect(rows[0]?.extraPaints.map((p) => p.text)).toEqual(['esame']);
    expect(rows[0]?.segPaints.map((p) => p.text)).toEqual(['esame', 'ECG']);
  });
});

describe('mergeExtraAnnotationsIntoGlideRowMap', () => {
  it('merges extras into segmentation and resets when row extras cleared', () => {
    const base = buildCorpusGlideRowsFromCache(
      [{ rowIndex: 0, text: 'ECG a riposo' }],
      () => ({ segments: [{ text: 'ECG', dictionaryId: 'd' }], unmatched: [], path: 'ECG' }),
      [],
      null,
      [],
    );
    const rowMap = new Map([[0, base[0]!]]);

    const withExtra = mergeExtraAnnotationsIntoGlideRowMap(
      rowMap,
      new Map([[0, ['esame']]]),
      [],
      null,
      [],
    );
    expect(withExtra.get(0)?.segPaints.map((p) => p.text)).toEqual(['esame', 'ECG']);

    const cleared = mergeExtraAnnotationsIntoGlideRowMap(
      withExtra,
      new Map([[1, ['other']]]),
      [],
      null,
      [],
    );
    expect(cleared.get(0)?.segPaints.map((p) => p.text)).toEqual(['ECG']);
  });
});

describe('buildCorpusGlideRows', () => {
  it('builds description runs and segmentation paints', () => {
    const rows = buildCorpusGlideRows(
      [{ rowIndex: 0, text: 'IVERMECTINA compresse' }],
      [],
      () => ({
        segments: [{ text: 'IVERMECTINA', dictionaryId: 'farmaci' }],
        unmatched: [],
        path: 'IVERMECTINA',
      }),
      [],
      null,
      [],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.segPaints).toHaveLength(1);
    expect(rows[0]?.segPaints[0]?.text).toBe('IVERMECTINA');
    expect(rows[0]?.descriptionRuns.length).toBeGreaterThan(0);
  });
});
