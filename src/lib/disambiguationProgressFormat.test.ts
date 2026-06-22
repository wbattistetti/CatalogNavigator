/**
 * Tests for disambiguation progress formatting helpers.
 */
import { describe, expect, it } from 'vitest';
import {
  bfsPseudoProgressPercent,
  estimateRemainingMinutes,
  formatElapsedMs,
} from './disambiguationProgressFormat';

describe('formatElapsedMs', () => {
  it('formats seconds and minutes', () => {
    expect(formatElapsedMs(5000)).toBe('5 s');
    expect(formatElapsedMs(65000)).toBe('1:05');
  });
});

describe('bfsPseudoProgressPercent', () => {
  it('approaches completion as the queue drains', () => {
    expect(bfsPseudoProgressPercent(900, 100)).toBeGreaterThan(80);
    expect(bfsPseudoProgressPercent(10, 990)).toBeLessThan(5);
  });
});

describe('estimateRemainingMinutes', () => {
  it('returns null when nothing processed yet', () => {
    expect(estimateRemainingMinutes(0, 100, 5000)).toBeNull();
  });

  it('extrapolates from elapsed time', () => {
    const eta = estimateRemainingMinutes(50, 100, 60_000);
    expect(eta).toBeCloseTo(1, 1);
  });
});
