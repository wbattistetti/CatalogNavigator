import { describe, expect, it } from 'vitest';
import {
  formatCorpusExtraDropValue,
  resetCorpusExtraDropDebugSequence,
  summarizeCorpusExtraDropData,
} from './corpusExtraDropDebug';

describe('corpusExtraDropDebug', () => {
  it('formats arrays and sets as readable strings', () => {
    expect(formatCorpusExtraDropValue([52, 53, 54])).toBe('[52, 53, 54]');
    expect(formatCorpusExtraDropValue(new Set([1, 2]))).toBe('{1, 2}');
  });

  it('summarizes payload for one-line logs', () => {
    resetCorpusExtraDropDebugSequence();
    const line = summarizeCorpusExtraDropData({
      rowIndices: [64, 132],
      count: 2,
    });
    expect(line).toContain('rowIndices=[64, 132]');
    expect(line).toContain('count=2');
  });
});
