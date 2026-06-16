/**
 * Tests for path segment canonicalization by dictionary category.order.
 */
import { describe, expect, it } from 'vitest';
import type { TokenCategory } from './dictionaryTree';
import type { KbDictionary } from './dictionaryLibrary';
import { buildLoadedRefs } from './multiDictionarySegment';
import {
  canonicalizedPathSetsEqual,
  canonicalizeItemPaths,
  canonicalizePathSegments,
  canonicalizePathSegmentsFromLoadedRefs,
  getPathOrderingCategories,
  itemPathsNeedCanonicalizationFromLoadedRefs,
} from './pathCanonicalize';
import { expandLeafPathsToTree } from './analysisTree';

const categories: TokenCategory[] = [
  { id: 'c1', name: 'specialità', order: 0, tokenTexts: ['cardiologica'] },
  { id: 'c2', name: 'tipo visita', order: 1, tokenTexts: ['prima'] },
  { id: 'c3', name: 'target', order: 2, tokenTexts: ['adulto', 'pediatrica'] },
  { id: 'c4', name: 'fascia di età', order: 3, tokenTexts: ['> 17 anni'], type: 'vincolo' },
  { id: 'c5', name: 'parte del corpo', order: 4, tokenTexts: ['cardiaco'] },
];

function makeDict(id: string, cats: TokenCategory[], tokenTexts: string[]): KbDictionary {
  return {
    id,
    name: id,
    industry: 'healthcare',
    industry_custom: null,
    description: null,
    scope: 'project',
    project_id: 'p1',
    icon_key: 'folder',
    icon_color: '#34d399',
    categories: cats,
    tokens: tokenTexts.map((text) => ({ text, enabled: true })),
    created_at: '',
    updated_at: '',
  };
}

describe('canonicalizePathSegments', () => {
  it('reorders segments to category.order (not alphabetical)', () => {
    expect(canonicalizePathSegments('cardiologica.adulto.prima', categories)).toBe(
      'cardiologica.prima.adulto',
    );
  });

  it('orders vincolo by category.order like attributo (not forced to path end)', () => {
    const ordered: TokenCategory[] = [
      { id: 'c1', name: 'specialità', order: 0, tokenTexts: ['cardiologica'] },
      { id: 'c2', name: 'fascia di età', order: 1, tokenTexts: ['> 17 anni'], type: 'vincolo' },
      { id: 'c3', name: 'tipo visita', order: 2, tokenTexts: ['prima'] },
      { id: 'c4', name: 'parte del corpo', order: 3, tokenTexts: ['inferiori'] },
    ];
    expect(canonicalizePathSegments('inferiori.> 17 anni.cardiologica.prima', ordered)).toBe(
      'cardiologica.> 17 anni.prima.inferiori',
    );
  });

  it('builds a coherent tree under cardiologica', () => {
    const leaves = canonicalizeItemPaths(
      [
        'cardiologica.prima.adulto.> 17 anni',
        'cardiologica.adulto.prima.> 17 anni',
        'cardiologica.pediatrica',
      ],
      categories,
    );
    const tree = expandLeafPathsToTree(leaves);
    const underCardio = tree.filter(
      (s) => s.startsWith('cardiologica.') && s.split('.').length === 2,
    );
    expect(underCardio).toEqual(['cardiologica.pediatrica', 'cardiologica.prima']);
  });
});

describe('getPathOrderingCategories', () => {
  it('merges categories from project then library with global order', () => {
    const projectCats: TokenCategory[] = [
      { id: 'pv', name: 'fascia', order: 0, tokenTexts: ['> 17 anni'], type: 'vincolo' },
    ];
    const libraryCats: TokenCategory[] = [
      { id: 'lt', name: 'tipo', order: 0, tokenTexts: ['ecodoppler'] },
      { id: 'lp', name: 'parte', order: 1, tokenTexts: ['arti inferiori'] },
      { id: 'lv', name: 'fascia', order: 2, tokenTexts: ['> 17 anni'], type: 'vincolo' },
    ];
    const loaded = buildLoadedRefs(
      [makeDict('proj', projectCats, ['> 17 anni'])],
      [{ dictionary: makeDict('lib', libraryCats, ['ecodoppler', 'arti inferiori', '> 17 anni']), sortOrder: 0 }],
    );
    const merged = getPathOrderingCategories(loaded);
    expect(merged.map((c) => c.name)).toEqual(['fascia', 'tipo', 'parte', 'fascia']);
    expect(merged.map((c) => c.order)).toEqual([0, 1, 2, 3]);
  });

  it('orders path by merged category.order when project vincolo is first', () => {
    const projectCats: TokenCategory[] = [
      { id: 'pv', name: 'fascia', order: 0, tokenTexts: ['> 17 anni'], type: 'vincolo' },
    ];
    const libraryCats: TokenCategory[] = [
      { id: 'lt', name: 'tipo', order: 0, tokenTexts: ['ecodoppler'] },
      { id: 'lp', name: 'parte', order: 1, tokenTexts: ['arti inferiori'] },
      { id: 'lv', name: 'fascia', order: 2, tokenTexts: ['> 17 anni'], type: 'vincolo' },
    ];
    const loaded = buildLoadedRefs(
      [makeDict('proj', projectCats, ['> 17 anni'])],
      [{ dictionary: makeDict('lib', libraryCats, ['ecodoppler', 'arti inferiori', '> 17 anni']), sortOrder: 0 }],
    );
    expect(canonicalizePathSegmentsFromLoadedRefs(
      'ecodoppler.arti inferiori.> 17 anni',
      loaded,
    )).toBe('> 17 anni.ecodoppler.arti inferiori');
  });
});

describe('canonicalizedPathSetsEqual', () => {
  const loaded = buildLoadedRefs([makeDict('p', categories, [
    'cardiologica', 'prima', 'adulto',
  ])], []);

  it('treats segment-order permutations as equal when canonical', () => {
    expect(canonicalizedPathSetsEqual(
      ['cardiologica.prima.adulto'],
      ['cardiologica.adulto.prima'],
      loaded,
    )).toBe(true);
  });

  it('detects wrong-order saved paths', () => {
    expect(itemPathsNeedCanonicalizationFromLoadedRefs(
      ['cardiologica.adulto.prima'],
      loaded,
    )).toBe(true);
  });
});
