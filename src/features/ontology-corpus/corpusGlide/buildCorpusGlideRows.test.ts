/**
 * Tests for corpus Glide row builder.
 */
import { describe, expect, it } from 'vitest';
import { buildCorpusGlidePreviewRows, buildCorpusGlideRows, buildCorpusGlideRowsFromCache } from './buildCorpusGlideRows';

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
  it('builds chip paints from cache without phrase matching on description', () => {
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
    expect(rows[0]?.descriptionRuns).toEqual([{ kind: 'text', text: 'IVERMECTINA compresse' }]);
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
