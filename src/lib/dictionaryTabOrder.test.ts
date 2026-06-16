/**
 * Tests for dictionary editor tab ordering and default focus.
 */
import { describe, expect, it } from 'vitest';
import type { KbDictionary } from './dictionaryLibrary';
import {
  loadedDictionaryEditorIds,
  preferredActiveDictionaryId,
} from './dictionaryTabOrder';

function mockDict(
  id: string,
  scope: 'project' | 'library',
  name: string,
  tokenTexts: string[],
): KbDictionary {
  return {
    id,
    name,
    industry: 'technology',
    industry_custom: null,
    description: null,
    scope,
    project_id: scope === 'project' ? 'p1' : null,
    icon_key: 'BookOpen',
    icon_color: '#38bdf8',
    categories: [],
    tokens: tokenTexts.map((text) => ({ text, enabled: true })),
    created_at: '',
    updated_at: '',
  };
}

describe('loadedDictionaryEditorIds', () => {
  it('returns project ids before library ids', () => {
    const project = mockDict('p', 'project', 'Project', []);
    const library = mockDict('l', 'library', 'Monica', ['a']);
    expect(loadedDictionaryEditorIds([library, project])).toEqual(['p', 'l']);
  });
});

describe('preferredActiveDictionaryId', () => {
  it('focuses project when it has tokens', () => {
    const project = mockDict('p', 'project', 'Project', ['x']);
    const library = mockDict('l', 'library', 'Monica', ['a', 'b']);
    expect(preferredActiveDictionaryId([project, library])).toBe('p');
  });

  it('focuses library when project is empty', () => {
    const project = mockDict('p', 'project', 'Project', []);
    const library = mockDict('l', 'library', 'Monica', ['a', 'b']);
    expect(preferredActiveDictionaryId([project, library])).toBe('l');
  });
});
