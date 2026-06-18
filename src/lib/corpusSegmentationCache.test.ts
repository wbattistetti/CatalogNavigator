/**
 * Tests for corpus segmentation cache.
 */
import { describe, expect, it } from 'vitest';
import {
  buildCorpusSegmentationCache,
  buildCorpusSegmentationCacheAsync,
  lookupCorpusSegmentation,
  orderUniqueCorpusTexts,
} from './corpusSegmentationCache';

describe('buildCorpusSegmentationCache', () => {
  it('caches segmentation per description text', () => {
    const cache = buildCorpusSegmentationCache(
      ['emocromo completo', 'emocromo completo'],
      [],
      [{ text: 'emocromo', enabled: true }],
      [],
    );
    expect(cache.size).toBe(1);
    expect(lookupCorpusSegmentation(cache, 'emocromo completo')!.segments.length).toBeGreaterThan(0);
  });

  it('orderUniqueCorpusTexts puts priority texts first', () => {
    expect(orderUniqueCorpusTexts(['b', 'a', 'c'], ['c', 'a'])).toEqual(['c', 'a', 'b']);
  });

  it('buildCorpusSegmentationCacheAsync reports incremental chunks and prioritizes viewport texts', async () => {
    const tokens = [{ text: 'alpha', enabled: true }, { text: 'beta', enabled: true }];
    const chunkSizes: number[] = [];
    const cache = await buildCorpusSegmentationCacheAsync(
      ['alpha one', 'beta two', 'alpha three'],
      [],
      tokens,
      [],
      {
        yieldEvery: 1,
        priorityTexts: ['beta two'],
        onChunk: (partial) => chunkSizes.push(partial.size),
      },
    );

    expect(cache.size).toBe(3);
    expect(chunkSizes.length).toBeGreaterThan(1);
    expect(cache.has('beta two')).toBe(true);
    expect(lookupCorpusSegmentation(cache, 'beta two')!.segments[0]?.text).toBe('beta');
  });
});
