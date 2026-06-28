/**
 * Unit tests for dictionary drag-and-drop helpers.
 */
import { describe, expect, it } from 'vitest';
import { categoryReorderIndexFromMidpoints } from './dictionaryTokenDrag';

describe('categoryReorderIndexFromMidpoints', () => {
  const midpoints = [112, 142, 172];

  it('returns 0 when pointer is above the first row midpoint', () => {
    expect(categoryReorderIndexFromMidpoints(105, midpoints)).toBe(0);
  });

  it('returns 1 when pointer is below first row midpoint but above second', () => {
    expect(categoryReorderIndexFromMidpoints(125, midpoints)).toBe(1);
  });

  it('returns row count when pointer is below the last row midpoint', () => {
    expect(categoryReorderIndexFromMidpoints(200, midpoints)).toBe(3);
  });

  it('returns 0 for an empty reorder list', () => {
    expect(categoryReorderIndexFromMidpoints(50, [])).toBe(0);
  });
});
