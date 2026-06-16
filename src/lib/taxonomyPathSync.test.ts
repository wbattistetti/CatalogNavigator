/**
 * Tests taxonomy sync with category-ordered path canonicalization.
 */
import { describe, expect, it } from 'vitest';
import type { TokenCategory } from './dictionaryTree';
import { syncTaxonomyFromLeafPaths } from './taxonomyPathSync';

const categories: TokenCategory[] = [
  { id: 'c1', name: 'specialità', order: 0, tokenTexts: ['cardiologica'] },
  { id: 'c2', name: 'tipo visita', order: 1, tokenTexts: ['prima'] },
  { id: 'c3', name: 'target', order: 2, tokenTexts: ['adulto'] },
];

describe('syncTaxonomyFromLeafPaths canonicalization', () => {
  it('rebuilds tree when stored paths have wrong segment order', () => {
    const wrongStored = syncTaxonomyFromLeafPaths(
      ['cardiologica.adulto.prima'],
      null,
      null,
    );
    expect(wrongStored.rows.some((r) => r.slot_filling === 'cardiologica.adulto')).toBe(true);

    const fixed = syncTaxonomyFromLeafPaths(
      ['cardiologica.prima.adulto'],
      wrongStored.rows,
      ['cardiologica.adulto.prima'],
      { categories },
    );

    expect(fixed.pathsUnchanged).toBe(false);
    expect(fixed.item_paths).toEqual(['cardiologica.prima.adulto']);
    expect(fixed.rows.some((r) => r.slot_filling === 'cardiologica.prima')).toBe(true);
    expect(fixed.rows.some((r) => r.slot_filling === 'cardiologica.adulto')).toBe(false);
  });

  it('canonicalizes incoming paths before building the tree', () => {
    const built = syncTaxonomyFromLeafPaths(
      ['cardiologica.adulto.prima'],
      null,
      null,
      { categories },
    );

    expect(built.item_paths).toEqual(['cardiologica.prima.adulto']);
    expect(built.rows.some((r) => r.slot_filling === 'cardiologica.prima')).toBe(true);
  });
});
