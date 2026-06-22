/**
 * Tests for corpus segmentation cache.
 */
import { describe, expect, it } from 'vitest';
import {
  adaptiveCorpusSegmentationYieldEvery,
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

  it('adaptiveCorpusSegmentationYieldEvery scales with corpus size', () => {
    expect(adaptiveCorpusSegmentationYieldEvery(100)).toBe(24);
    expect(adaptiveCorpusSegmentationYieldEvery(1_000)).toBe(50);
    expect(adaptiveCorpusSegmentationYieldEvery(5_000)).toBe(150);
    expect(adaptiveCorpusSegmentationYieldEvery(12_000)).toBe(300);
  });

  it('buildCorpusSegmentationCacheAsync builds the full cache in one pass', async () => {
    const tokens = [{ text: 'alpha', enabled: true }, { text: 'beta', enabled: true }];
    const cache = await buildCorpusSegmentationCacheAsync(
      ['alpha one', 'beta two', 'alpha three'],
      [],
      tokens,
      [],
      { yieldEvery: 1 },
    );

    expect(cache.size).toBe(3);
    expect(lookupCorpusSegmentation(cache, 'beta two')!.segments[0]?.text).toBe('beta');
  });

  it('buildCorpusSegmentationCacheAsync respects cancellation', async () => {
    const cache = await buildCorpusSegmentationCacheAsync(
      ['alpha one', 'beta two', 'gamma three'],
      [],
      [{ text: 'alpha', enabled: true }],
      [],
      {
        shouldCancel: () => true,
      },
    );

    expect(cache.size).toBe(0);
  });

  it('buildCorpusSegmentationCacheAsync resumes from existingCache', async () => {
    const existing = new Map<string, { segments: { text: string; dictionaryId: string }[]; unmatched: string[]; path: string }>();
    existing.set('alpha one', {
      segments: [{ text: 'alpha', dictionaryId: '' }],
      unmatched: [],
      path: 'root/alpha',
    });

    const cache = await buildCorpusSegmentationCacheAsync(
      ['alpha one', 'beta two', 'gamma three'],
      [],
      [{ text: 'beta', enabled: true }],
      [],
      { existingCache: existing },
    );

    expect(cache.size).toBe(3);
    expect(cache.get('alpha one')?.path).toBe('root/alpha');
    expect(lookupCorpusSegmentation(cache, 'beta two')!.segments[0]?.text).toBe('beta');
  });
});
