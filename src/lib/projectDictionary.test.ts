/**
 * Tests for canonical single project dictionary selection.
 */
import { describe, expect, it } from 'vitest';
import type { KbDictionary } from './dictionaryLibrary';
import { canonicalProjectDictionary } from './projectDictionary';
import { PROJECT_DICTIONARY_TAB_LABEL } from './dictionaryTabOrder';

function mockProject(id: string, name: string, created = '2020-01-01'): KbDictionary {
  return {
    id,
    name,
    industry: 'technology',
    industry_custom: null,
    description: null,
    scope: 'project',
    project_id: 'p1',
    icon_key: 'BookOpen',
    icon_color: '#38bdf8',
    categories: [],
    tokens: [],
    created_at: created,
    updated_at: created,
  };
}

describe('canonicalProjectDictionary', () => {
  it('prefers dictionary named Project', () => {
    const legacy = mockProject('a', 'Documento (migrato)', '2019-01-01');
    const project = mockProject('b', PROJECT_DICTIONARY_TAB_LABEL, '2020-01-01');
    expect(canonicalProjectDictionary([legacy, project])?.id).toBe('b');
  });

  it('returns oldest when no Project name exists', () => {
    const older = mockProject('a', 'Alpha', '2018-01-01');
    const newer = mockProject('b', 'Beta', '2020-01-01');
    expect(canonicalProjectDictionary([newer, older])?.id).toBe('a');
  });

  it('returns null for empty list', () => {
    expect(canonicalProjectDictionary([])).toBeNull();
  });
});
