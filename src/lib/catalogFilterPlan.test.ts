/**
 * Tests for catalogFilterPlan — mirrors VB CatalogFilter in disambiguation BFS.
 */
import { describe, expect, it } from 'vitest';
import type { BundleCorpusItem } from './agentBundleTypes';
import type { TokenCategory } from './dictionaryTree';
import { filterPlanCandidates } from './catalogFilterPlan';
import { buildCorpusItemsWithConstraints } from './corpusItemCompile';
import { normalizeSlotCategoryKey } from './slotExtract';

const categories: TokenCategory[] = [
  { id: 'c1', name: 'specialità', order: 0, tokenTexts: ['cardiologica'] },
  { id: 'c2', name: 'tipo visita', order: 1, tokenTexts: ['prima visita'] },
];

describe('filterPlanCandidates', () => {
  it('returns no candidates when nothing is acquired (bootstrap guard)', () => {
    const items = buildCorpusItemsWithConstraints(['cardiologica.prima visita'], categories);
    const filtered = filterPlanCandidates(items, {
      acquired: {},
      ageTotalWeeks: null,
      ageYears: null,
      exactAttributoCategories: [],
    }, categories);
    expect(filtered).toEqual([]);
  });

  it('filters by implicit attributo acquisition without exact commit', () => {
    const items = buildCorpusItemsWithConstraints(
      ['cardiologica.prima visita', 'allergologica.prima visita'],
      categories,
    );
    const filtered = filterPlanCandidates(items, {
      acquired: { [normalizeSlotCategoryKey('specialità')]: 'cardiologica' },
      ageTotalWeeks: null,
      ageYears: null,
      exactAttributoCategories: [],
    }, categories);
    expect(filtered.map((i) => i.path)).toEqual(['cardiologica.prima visita']);
  });

  it('filters pediatric paths out after adult age answer', () => {
    const examCategories: TokenCategory[] = [
      { id: 'c0', name: 'tipo prestazione', order: 0, tokenTexts: ['esame'] },
      { id: 'c1', name: 'specialità', order: 1, tokenTexts: ['pediatrico'] },
      {
        id: 'c2',
        name: 'fascia di età',
        order: 2,
        type: 'vincolo',
        tokenTexts: ['over 17 anni', 'da over 1 anno under 16 anni'],
        valueKind: 'age_years',
      },
      { id: 'c3', name: 'esame', order: 3, tokenTexts: ['ecg'] },
    ];
    const paths = [
      'esame.over 17 anni.ecg',
      'esame.pediatrico.ecg.da over 1 anno under 16 anni',
    ];
    const items = buildCorpusItemsWithConstraints(paths, examCategories);
    const baseState = {
      acquired: { [normalizeSlotCategoryKey('tipo prestazione')]: 'esame' },
      ageTotalWeeks: 30 * 52,
      ageYears: 30,
      exactAttributoCategories: [] as string[],
    };
    const filtered = filterPlanCandidates(items, baseState, examCategories);
    expect(filtered.map((i) => i.path)).toEqual(['esame.over 17 anni.ecg']);
  });
});
