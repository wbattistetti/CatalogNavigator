import { describe, expect, it } from 'vitest';
import { applyExtraSelectionClick } from './corpusExtraSelectionLogic';

describe('applyExtraSelectionClick', () => {
  it('selects a single row on plain click', () => {
    const result = applyExtraSelectionClick(new Set([2, 3]), 5, 2, {
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
    });
    expect([...result.selection]).toEqual([5]);
    expect(result.anchor).toBe(5);
  });

  it('extends range on shift+click from anchor', () => {
    const result = applyExtraSelectionClick(new Set([1]), 5, 1, {
      shiftKey: true,
      ctrlKey: false,
      metaKey: false,
    });
    expect([...result.selection]).toEqual([1, 2, 3, 4, 5]);
    expect(result.anchor).toBe(1);
  });

  it('toggles rows on ctrl+click', () => {
    const result = applyExtraSelectionClick(new Set([1, 2]), 2, 1, {
      shiftKey: false,
      ctrlKey: true,
      metaKey: false,
    });
    expect([...result.selection]).toEqual([1]);
    expect(result.anchor).toBe(2);
  });

  it('falls back to single select when shift+click without anchor', () => {
    const result = applyExtraSelectionClick(new Set(), 4, null, {
      shiftKey: true,
      ctrlKey: false,
      metaKey: false,
    });
    expect([...result.selection]).toEqual([4]);
    expect(result.anchor).toBe(4);
  });
});
