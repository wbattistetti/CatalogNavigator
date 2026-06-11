/**
 * Tests for corpus segmentation cache.
 */
import { describe, expect, it } from 'vitest';
import { buildCorpusSegmentationCache, lookupCorpusSegmentation } from './corpusSegmentationCache';

describe('buildCorpusSegmentationCache', () => {
  it('caches segmentation per description text', () => {
    const cache = buildCorpusSegmentationCache(
      ['emocromo completo', 'emocromo completo'],
      [],
      [{ text: 'emocromo', enabled: true }],
      [],
    );
    expect(cache.size).toBe(1);
    expect(lookupCorpusSegmentation(cache, 'emocromo completo').segments.length).toBeGreaterThan(0);
  });
});
