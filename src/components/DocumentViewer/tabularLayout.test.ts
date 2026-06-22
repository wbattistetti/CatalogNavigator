import { describe, expect, it } from 'vitest';
import {
  autoColumnWidthPx,
  buildTabularGridTemplate,
  sampleRowsForWidth,
  tabularTableMinWidthPx,
} from './tabularLayout';

describe('sampleRowsForWidth', () => {
  it('returns all rows when under sample limit', () => {
    const rows = [['a'], ['b']];
    expect(sampleRowsForWidth(rows)).toBe(rows);
  });

  it('truncates to sample size for large tables', () => {
    const rows = Array.from({ length: 500 }, (_, i) => [`${i}`]);
    expect(sampleRowsForWidth(rows)).toHaveLength(200);
    expect(sampleRowsForWidth(rows)[0]).toEqual(['0']);
  });
});

describe('autoColumnWidthPx', () => {
  it('respects min and max width bounds', () => {
    const width = autoColumnWidthPx('X', [['']], 0);
    expect(width).toBeGreaterThanOrEqual(56);
    expect(width).toBeLessThanOrEqual(420);
  });
});

describe('buildTabularGridTemplate', () => {
  it('uses minmax for flex column', () => {
    const template = buildTabularGridTemplate([120, 200, 80], 1);
    expect(template).toBe('40px 120px minmax(200px, 1fr) 80px');
  });
});

describe('tabularTableMinWidthPx', () => {
  it('sums fixed columns plus flex minimum', () => {
    expect(tabularTableMinWidthPx([100, 180, 90], 1)).toBe(40 + 100 + 180 + 90);
  });
});
