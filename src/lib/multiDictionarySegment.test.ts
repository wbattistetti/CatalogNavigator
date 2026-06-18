/**
 * Tests multi-dictionary path segment ordering by category.order (not dict priority).
 */
import { describe, expect, it } from 'vitest';
import type { TokenCategory } from './dictionaryTree';
import type { KbDictionary } from './dictionaryLibrary';
import {
  buildLoadedRefs,
  findHighlightSpansFromLoadedRefs,
  mergeAllDictionarySessionsIntoLoadedRefs,
  segmentAllDescriptionsFromLoadedRefs,
  segmentAllDescriptionsFromLoadedRefsAsync,
  segmentDescriptionMulti,
  type LoadedDictionaryRef,
} from './multiDictionarySegment';

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
    scope: id.startsWith('lib') ? 'library' : 'project',
    project_id: 'proj-1',
    icon_key: 'folder',
    icon_color: '#34d399',
    categories,
    tokens: tokens.map((t) => ({ text: t.text, enabled: true })),
    created_at: '',
    updated_at: '',
  };
}

describe('segmentDescriptionMulti category order', () => {
  const projectCategories: TokenCategory[] = [
    { id: 'c1', name: 'specialità', order: 0, tokenTexts: ['cardiologica'] },
    { id: 'c2', name: 'tipo visita', order: 1, tokenTexts: ['prima'] },
    { id: 'c3', name: 'target', order: 2, tokenTexts: ['pediatrica'] },
    { id: 'c4', name: 'fascia di età', order: 3, tokenTexts: ['> 17 anni'], type: 'vincolo' },
  ];

  const projectDict = makeDict('proj', projectCategories, [
    { text: 'cardiologica' },
    { text: 'prima' },
    { text: 'pediatrica' },
    { text: '> 17 anni' },
  ]);

  const libraryDict = makeDict('lib-visite', [], [
    { text: 'pediatrica' },
    { text: '> 17 anni' },
  ]);

  const loaded: LoadedDictionaryRef[] = buildLoadedRefs([projectDict], [
    { dictionary: libraryDict, sortOrder: 0 },
  ]);

  it('orders path by category.order across project + library tokens', () => {
    const text = 'prima visita cardiologica pediatrica > 17 anni';
    const result = segmentDescriptionMulti(text, loaded);
    expect(result.path).toBe('cardiologica.prima.pediatrica.> 17 anni');
  });

  it('reorders path when category order changes (same tokens)', () => {
    const swappedProject: TokenCategory[] = [
      { id: 'c1', name: 'tipo visita', order: 0, tokenTexts: ['prima'] },
      { id: 'c2', name: 'specialità', order: 1, tokenTexts: ['cardiologica'] },
      { id: 'c3', name: 'target', order: 2, tokenTexts: ['pediatrica'] },
    ];
    const swappedDict = makeDict('proj', swappedProject, [
      { text: 'cardiologica' },
      { text: 'prima' },
      { text: 'pediatrica' },
    ]);
    const swappedLoaded = buildLoadedRefs([swappedDict], [
      { dictionary: libraryDict, sortOrder: 0 },
    ]);

    const text = 'prima visita cardiologica pediatrica';
    const before = segmentDescriptionMulti(text, loaded).path;
    const after = segmentDescriptionMulti(text, swappedLoaded).path;

    expect(before).toBe('cardiologica.prima.pediatrica');
    expect(after).toBe('prima.cardiologica.pediatrica');
    expect(before).not.toBe(after);
  });

  it('roots ecodoppler when library is the only full category source', () => {
    const libraryCats: TokenCategory[] = [
      { id: 'lt', name: 'tipo', order: 0, tokenTexts: ['ecodoppler'] },
      { id: 'lp', name: 'parte', order: 1, tokenTexts: ['arti inferiori', 'arti superiori'] },
      { id: 'lv', name: 'fascia', order: 2, tokenTexts: ['> 17 anni'], type: 'vincolo' },
    ];
    const libraryDict = makeDict('lib-eco', libraryCats, [
      { text: 'ecodoppler' },
      { text: 'arti inferiori' },
      { text: 'arti superiori' },
      { text: '> 17 anni' },
    ]);
    const loaded = buildLoadedRefs([], [{ dictionary: libraryDict, sortOrder: 0 }]);

    const text = 'ecodoppler arti inferiori > 17 anni';
    expect(segmentDescriptionMulti(text, loaded).path).toBe(
      'ecodoppler.arti inferiori.> 17 anni',
    );
  });

  it('orders vincolo by category.order when fasce is second after specialità', () => {
    const cats: TokenCategory[] = [
      { id: 'c1', name: 'specialità', order: 0, tokenTexts: ['angiologica'] },
      { id: 'c2', name: 'fascia di età', order: 1, tokenTexts: ['> 17 anni'], type: 'vincolo' },
      { id: 'c3', name: 'parte', order: 2, tokenTexts: ['inferiori'] },
    ];
    const libraryDict = makeDict('lib-angio', cats, [
      { text: 'angiologica' },
      { text: 'inferiori' },
      { text: '> 17 anni' },
    ]);
    const loaded = buildLoadedRefs([], [{ dictionary: libraryDict, sortOrder: 0 }]);

    const text = 'angiologica inferiori > 17 anni';
    expect(segmentDescriptionMulti(text, loaded).path).toBe('angiologica.> 17 anni.inferiori');
  });

  it('does not match token removed from library live session', () => {
    const categories: TokenCategory[] = [
      { id: 'c1', name: 'specialità', order: 0, tokenTexts: ['cardiologica'] },
      { id: 'c2', name: 'tipo visita', order: 1, tokenTexts: ['prima'] },
    ];
    const projectDict = makeDict('proj', categories, [
      { text: 'cardiologica' },
      { text: 'prima' },
    ]);
    const libraryDict = makeDict('lib-visite', categories, [
      { text: 'cardiologica' },
      { text: 'prima' },
      { text: 'incluso eventuale ecg' },
    ]);
    const loaded = buildLoadedRefs([projectDict], [{ dictionary: libraryDict, sortOrder: 0 }]);
    const liveLoaded = mergeAllDictionarySessionsIntoLoadedRefs(loaded, (id) => (
      id === libraryDict.id
        ? {
          tokens: libraryDict.tokens.filter((t) => t.text !== 'incluso eventuale ecg'),
          categories,
        }
        : null
    ));

    const text = 'prima visita cardiologica incluso eventuale ecg';
    const result = segmentDescriptionMulti(text, liveLoaded);
    expect(result.path).toBe('cardiologica.prima');
    expect(result.segments.map((s) => s.text)).not.toContain('incluso eventuale ecg');
    expect(result.unmatched.join(' ')).toContain('ecg');
  });

  it('description highlights match segmentation phrases for live loaded refs', () => {
    const categories: TokenCategory[] = [
      { id: 'c1', name: 'specialità', order: 0, tokenTexts: ['cardiologica'] },
      { id: 'c2', name: 'tipo visita', order: 1, tokenTexts: ['prima'] },
    ];
    const projectDict = makeDict('proj', categories, [
      { text: 'cardiologica' },
      { text: 'prima' },
    ]);
    const loaded = buildLoadedRefs([projectDict], []);
    const text = 'prima visita cardiologica';
    const segmented = segmentDescriptionMulti(text, loaded).segments.map((s) => s.text);
    const highlighted = findHighlightSpansFromLoadedRefs(text, loaded).map((s) => s.canonical);
    expect(highlighted.sort()).toEqual(segmented.sort());
  });

  it('segmentAllDescriptionsFromLoadedRefsAsync reports progress and supports cancel', async () => {
    const categories: TokenCategory[] = [
      { id: 'c1', name: 'specialità', order: 0, tokenTexts: ['cardiologica'] },
      { id: 'c2', name: 'tipo visita', order: 1, tokenTexts: ['prima'] },
    ];
    const projectDict = makeDict('proj', categories, [
      { text: 'cardiologica' },
      { text: 'prima' },
    ]);
    const loaded = buildLoadedRefs([projectDict], []);
    const descriptions = Array.from({ length: 120 }, (_, i) =>
      i % 2 === 0 ? 'prima visita cardiologica' : '  ',
    );

    const progressCalls: Array<[number, number]> = [];
    let cancelAfter = 0;

    const { leafPaths, cancelled } = await segmentAllDescriptionsFromLoadedRefsAsync(
      descriptions,
      loaded,
      {
        yieldEvery: 10,
        onProgress: (current, total) => progressCalls.push([current, total]),
        shouldCancel: () => {
          cancelAfter += 1;
          return cancelAfter > 25;
        },
      },
    );

    expect(cancelled).toBe(true);
    expect(leafPaths.length).toBeGreaterThan(0);
    expect(leafPaths.length).toBeLessThan(descriptions.filter((d) => d.trim()).length);
    expect(progressCalls.length).toBeGreaterThan(0);
    expect(progressCalls[0]).toEqual([0, descriptions.length]);

    const syncResult = segmentAllDescriptionsFromLoadedRefs(
      descriptions.filter((d) => d.trim()),
      loaded,
    );
    expect(syncResult.leafPaths.length).toBeGreaterThan(leafPaths.length);
  });
});
