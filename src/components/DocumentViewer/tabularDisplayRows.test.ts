import { describe, expect, it } from 'vitest';
import { buildDisplayRowIndices, buildDisplayRowModel } from './tabularDisplayRows';

describe('buildDisplayRowIndices', () => {
  const rows = [
    ['A', '1'],
    ['B', '2'],
    ['Alpha', '3'],
  ];

  it('returns contiguous indices when filter is empty', () => {
    expect(buildDisplayRowIndices(3, rows, [0, 1], '')).toEqual([0, 1, 2]);
  });

  it('filters rows by visible columns only', () => {
    expect(buildDisplayRowIndices(3, rows, [0], 'a')).toEqual([0, 2]);
  });
});

describe('buildDisplayRowModel', () => {
  const rows = [
    ['A', '1'],
    ['B', '2'],
    ['Alpha', '3'],
  ];

  it('uses identity mapping without filter', () => {
    const model = buildDisplayRowModel(3, rows, [0, 1], '');
    expect(model.count).toBe(3);
    expect(model.toSourceIndex(0)).toBe(0);
    expect(model.toSourceIndex(2)).toBe(2);
    expect(model.toSourceIndex(3)).toBeUndefined();
  });

  it('ignores whitespace-only filter', () => {
    const model = buildDisplayRowModel(3, rows, [0, 1], '   ');
    expect(model.count).toBe(3);
  });
});
