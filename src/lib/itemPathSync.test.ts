/**
 * Tests for flat item_paths sync (no taxonomy tree).
 */
import { describe, expect, it } from 'vitest';
import { syncItemPaths } from './itemPathSync';

describe('syncItemPaths', () => {
  it('detects added and removed paths', () => {
    const result = syncItemPaths(['a.b', 'c.d'], ['a.b', 'x.y']);
    expect(result.pathsUnchanged).toBe(false);
    expect(result.item_paths).toEqual(['a.b', 'c.d']);
    expect(result.summary).toEqual({ addedItemPaths: 1, removedItemPaths: 1 });
  });

  it('reports unchanged when sets match', () => {
    const result = syncItemPaths(['a.b', 'c.d'], ['c.d', 'a.b']);
    expect(result.pathsUnchanged).toBe(true);
    expect(result.summary).toEqual({ addedItemPaths: 0, removedItemPaths: 0 });
  });
});
