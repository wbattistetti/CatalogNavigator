/**
 * Tests for per-dictionary session store subscriptions.
 */
import { describe, expect, it, vi } from 'vitest';
import { createDictionaryEditSession } from './dictionaryEditSession';
import type { KbDictionary } from './dictionaryLibrary';
import {
  getDictionarySession,
  publishDictionarySession,
  replaceDictionarySessions,
  subscribeDictionarySession,
} from './dictionarySessionStore';

function mockDict(id: string): KbDictionary {
  return {
    id,
    name: id,
    industry: 'healthcare',
    industry_custom: null,
    description: null,
    scope: 'project',
    project_id: 'p1',
    icon_key: 'Folder',
    icon_color: '#fff',
    categories: [],
    tokens: [],
    created_at: '',
    updated_at: '',
  };
}

describe('dictionarySessionStore', () => {
  it('notifies only subscribers of the changed dictionary', () => {
    const aListener = vi.fn();
    const bListener = vi.fn();
    subscribeDictionarySession('a', aListener);
    subscribeDictionarySession('b', bListener);

    const sessionA = createDictionaryEditSession(mockDict('a'));
    publishDictionarySession('a', sessionA);

    expect(aListener).toHaveBeenCalledTimes(1);
    expect(bListener).not.toHaveBeenCalled();
    expect(getDictionarySession('a')).toBe(sessionA);
  });

  it('replaceDictionarySessions notifies all touched dictionaries', () => {
    const aListener = vi.fn();
    const bListener = vi.fn();
    publishDictionarySession('a', createDictionaryEditSession(mockDict('a')));
    subscribeDictionarySession('a', aListener);
    subscribeDictionarySession('b', bListener);

    const next = new Map([
      ['b', createDictionaryEditSession(mockDict('b'))],
    ]);
    replaceDictionarySessions(next);

    expect(aListener).toHaveBeenCalled();
    expect(bListener).toHaveBeenCalled();
    expect(getDictionarySession('a')).toBeNull();
    expect(getDictionarySession('b')).not.toBeNull();
  });
});
