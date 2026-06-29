import { describe, expect, it } from 'vitest';
import { resolveExtraDisplayRowAtClientPoint } from './resolveGlideCellAtClientPoint';

describe('resolveExtraDisplayRowAtClientPoint', () => {
  it('returns display row when client point is inside extra column bounds', () => {
    const gridRef = {
      getBounds: (col: number, row: number) => {
        if (col !== 2) return undefined;
        return { x: 100, y: 50 + row * 24, width: 80, height: 24 };
      },
    };

    expect(resolveExtraDisplayRowAtClientPoint(gridRef, 120, 62, 5, 2)).toBe(0);
    expect(resolveExtraDisplayRowAtClientPoint(gridRef, 120, 86, 5, 2)).toBe(1);
  });

  it('returns null when point is outside all rows', () => {
    const gridRef = {
      getBounds: () => ({ x: 0, y: 0, width: 10, height: 10 }),
    };

    expect(resolveExtraDisplayRowAtClientPoint(gridRef, 50, 50, 3, 2)).toBeNull();
  });
});
