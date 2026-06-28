import { describe, expect, it } from 'vitest';
import {
  buildSessionFromInjectedPairs,
  injectableCategories,
  upsertInjectedPair,
} from './injectedConcepts';
import type { TokenCategory } from './dictionaryTree';

const categories: TokenCategory[] = [
  {
    id: 'c1',
    name: 'specialità',
    order: 0,
    tokenTexts: ['cardiologica', 'angiologica'],
    type: 'attributo',
  },
  {
    id: 'c2',
    name: 'medico',
    order: 1,
    tokenTexts: ['bianchi', 'rossi'],
    type: 'attributo',
  },
  {
    id: 'c3',
    name: 'fascia di età',
    order: 2,
    tokenTexts: ['> 17 anni'],
    type: 'vincolo',
  },
  {
    id: 'c4',
    name: 'vuota',
    order: 3,
    tokenTexts: [],
    type: 'attributo',
  },
];

describe('injectedConcepts', () => {
  it('injectableCategories skips empty token lists', () => {
    expect(injectableCategories(categories).map((c) => c.name)).toEqual([
      'specialità',
      'medico',
      'fascia di età',
    ]);
  });

  it('upsertInjectedPair replaces same category', () => {
    const next = upsertInjectedPair(
      [{ categoryName: 'specialità', token: 'cardiologica' }],
      { categoryName: 'specialità', token: 'angiologica' },
    );
    expect(next).toEqual([{ categoryName: 'specialità', token: 'angiologica' }]);
  });

  it('buildSessionFromInjectedPairs sets exact attributo categories', () => {
    const session = buildSessionFromInjectedPairs(
      [{ categoryName: 'specialità', token: 'cardiologica' }],
      categories,
    );
    expect(session.acquiredConcepts).toEqual([
      { category: 'specialità', values: ['cardiologica'], kind: 'attributo' },
    ]);
    expect(session.exactAttributoCategories).toEqual(['specialità']);
  });

  it('buildSessionFromInjectedPairs marks vincolo kind without exact flag', () => {
    const session = buildSessionFromInjectedPairs(
      [{ categoryName: 'fascia di età', token: '> 17 anni' }],
      categories,
    );
    expect(session.acquiredConcepts[0]?.kind).toBe('vincolo');
    expect(session.exactAttributoCategories).toEqual([]);
  });
});
