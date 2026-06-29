import { describe, expect, it } from 'vitest';
import { extraColumnDisplayRowsFromGridSelection } from './extraColumnDisplayRowsFromGridSelection';

describe('extraColumnDisplayRowsFromGridSelection', () => {
  it('returns display rows when range spans the extra column', () => {
    const rows = extraColumnDisplayRowsFromGridSelection({
      columns: { length: 0 } as never,
      rows: { length: 0 } as never,
      current: {
        cell: [2, 4],
        range: { x: 2, y: 1, width: 1, height: 4 },
        rangeStack: [],
      },
    }, 2);
    expect(rows).toEqual([1, 2, 3, 4]);
  });

  it('ignores ranges that do not overlap the extra column', () => {
    const rows = extraColumnDisplayRowsFromGridSelection({
      columns: { length: 0 } as never,
      rows: { length: 0 } as never,
      current: {
        cell: [1, 3],
        range: { x: 1, y: 3, width: 1, height: 1 },
        rangeStack: [],
      },
    }, 2);
    expect(rows).toEqual([]);
  });
});
