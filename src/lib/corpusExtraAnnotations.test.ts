/**
 * Tests for corpus extra column annotations.
 */
import { describe, expect, it } from 'vitest';
import {
  appendExtraTokens,
  applyExtraAnnotationsToRows,
  corpusExtraAnnotationsFromStorage,
  corpusExtraAnnotationsToStorage,
  mergeExtraIntoSegmentation,
  mergeExtraTokensIntoPath,
} from './corpusExtraAnnotations';

describe('corpusExtraAnnotations', () => {
  it('round-trips storage by row index', () => {
    const map = new Map([[3, ['visita', 'cardiologica']]]);
    expect(corpusExtraAnnotationsToStorage(map)).toEqual({ '3': ['visita', 'cardiologica'] });
    expect(corpusExtraAnnotationsFromStorage({ '3': ['visita', 'cardiologica'] }).get(3)).toEqual(['visita', 'cardiologica']);
  });
  it('appends without replacing', () => {
    expect(appendExtraTokens(new Map([[1, ['visita']]]), 1, ['ecg']).get(1)).toEqual(['visita', 'ecg']);
  });
  it('merges path with extras first', () => {
    expect(mergeExtraTokensIntoPath('a.b', ['c'])).toBe('c.a.b');
  });
  it('applies by rowIndex', () => {
    const rows = applyExtraAnnotationsToRows([{ rowIndex: 2, sourceText: 'x', path: 'a.b', unmatched: [] }], new Map([[2, ['c']]]));
    expect(rows[0].path).toBe('c.a.b');
  });
  it('merges manual tokens into segmentation segments', () => {
    const merged = mergeExtraIntoSegmentation(
      { segments: [{ text: 'ecg', dictionaryId: 'd1' }], unmatched: [], path: 'ecg' },
      ['esame'],
    );
    expect(merged.segments.map((s) => s.text)).toEqual(['esame', 'ecg']);
    expect(merged.path).toBe('esame.ecg');
  });
  it('skips duplicate extra tokens already segmented from text', () => {
    const merged = mergeExtraIntoSegmentation(
      { segments: [{ text: 'visita', dictionaryId: 'd1' }], unmatched: [], path: 'visita' },
      ['visita', 'ecg'],
    );
    expect(merged.segments.map((s) => s.text)).toEqual(['ecg', 'visita']);
    expect(merged.path).toBe('ecg.visita');
  });
});
