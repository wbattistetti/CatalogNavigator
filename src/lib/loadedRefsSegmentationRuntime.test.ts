import { describe, expect, it } from 'vitest';
import type { TokenCategory } from './dictionaryTree';
import type { KbDictionary } from './dictionaryLibrary';
import {
  buildLoadedRefs,
  segmentDescriptionMulti,
  type LoadedDictionaryRef,
} from './multiDictionarySegment';
import { buildLoadedRefsSegmentationRuntime } from './loadedRefsSegmentationRuntime';

function makeDict(
  id: string,
  categories: TokenCategory[],
  tokens: Array<{ text: string }>,
): KbDictionary {
  return {
    id,
    name: id,
    industry: 'healthcare',
    industry_custom: null,
    description: null,
    scope: 'project',
    project_id: 'proj-1',
    icon_key: 'folder',
    icon_color: '#34d399',
    categories,
    tokens: tokens.map((t) => ({ text: t.text, enabled: true })),
    created_at: '',
    updated_at: '',
  };
}

describe('buildLoadedRefsSegmentationRuntime', () => {
  it('segmentDescriptionMulti with runtime matches without runtime', () => {
    const categories: TokenCategory[] = [
      { id: 'c1', name: 'specialità', order: 0, tokenTexts: ['cardiologica'] },
      { id: 'c2', name: 'tipo visita', order: 1, tokenTexts: ['prima'] },
    ];
    const dict = makeDict('proj', categories, [
      { text: 'cardiologica' },
      { text: 'prima' },
    ]);
    const loaded: LoadedDictionaryRef[] = buildLoadedRefs([dict], []);
    const text = 'prima visita cardiologica';
    const runtime = buildLoadedRefsSegmentationRuntime(loaded);

    const without = segmentDescriptionMulti(text, loaded);
    const withRuntime = segmentDescriptionMulti(text, loaded, runtime.taggedPhrases, runtime);

    expect(withRuntime).toEqual(without);
  });
});
