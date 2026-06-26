/**
 * Tests for dictionary dirty snapshot (includes category settings).
 */
import { describe, expect, it } from 'vitest';
import { isDictionaryEditSessionDirty, createDictionaryEditSession } from './dictionaryEditSession';
import type { KbDictionary } from './dictionaryLibrary';
import { serializeDictionarySnapshot } from './serializeTokens';

const baseDict: KbDictionary = {
  id: 'd1',
  name: 'Test',
  industry: 'healthcare',
  industry_custom: null,
  description: null,
  scope: 'project',
  project_id: 'p1',
  icon_key: 'BookOpen',
  icon_color: '#38bdf8',
  tokens: [{ text: 'prima', enabled: true }, { text: 'controllo', enabled: true }],
  categories: [{
    id: 'c1',
    name: 'tipo visita',
    order: 0,
    tokenTexts: ['prima', 'controllo'],
    type: 'attributo',
  }],
  created_at: '',
  updated_at: '',
};

describe('serializeDictionarySnapshot', () => {
  it('detects winner setting changes', () => {
    const before = serializeDictionarySnapshot(baseDict.tokens, baseDict.categories);
    const after = serializeDictionarySnapshot(baseDict.tokens, [{
      ...baseDict.categories[0]!,
      winner: 'controllo',
      cardinality: 'single',
    }]);
    expect(before).not.toBe(after);
  });
});

describe('isDictionaryEditSessionDirty', () => {
  it('marks session dirty when only category winner changes', () => {
    const session = createDictionaryEditSession(baseDict);
    expect(session.dirty).toBe(false);

    const updated = {
      ...session,
      categories: [{
        ...session.categories[0]!,
        winner: 'controllo',
        cardinality: 'single' as const,
      }],
    };
    expect(isDictionaryEditSessionDirty(updated)).toBe(true);
  });
});
