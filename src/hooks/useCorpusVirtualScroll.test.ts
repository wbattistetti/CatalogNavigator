import { describe, expect, it } from 'vitest';
import { computeWindow } from './useCorpusVirtualScroll';

describe('computeWindow', () => {
  it('maps scroll position to a fixed-height virtual range', () => {
    const window = computeWindow(360, 400, 11000, 36, 6);
    expect(window.start).toBe(4);
    expect(window.offsetY).toBe(144);
    expect(window.end).toBeGreaterThan(window.start);
    expect(window.end).toBeLessThanOrEqual(11000);
  });

  it('clamps start at zero near the top', () => {
    const window = computeWindow(0, 400, 11000, 36, 6);
    expect(window.start).toBe(0);
    expect(window.offsetY).toBe(0);
  });
});
