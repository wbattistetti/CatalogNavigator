/**
 * Tests for dirty dictionary session listing.
 */
import { describe, expect, it } from 'vitest';
import type { DictionaryEditSession } from '../../lib/dictionaryEditSession';
import { hasAnyDirtyDictionary, listDirtyDictionaryIds } from './dictionaryDirty';

function session(id: string, dirty: boolean): [string, DictionaryEditSession] {
  return [id, {
    dictionaryId: id,
    tokens: [],
    categories: [],
    savedSnapshot: '',
    dirty,
    compactSnapshot: false,
  }];
}

describe('dictionaryDirty', () => {
  it('lists only dirty dictionary ids', () => {
    const map = new Map([session('a', true), session('b', false), session('c', true)]);
    expect(listDirtyDictionaryIds(map)).toEqual(['a', 'c']);
    expect(hasAnyDirtyDictionary(map)).toBe(true);
  });
});
