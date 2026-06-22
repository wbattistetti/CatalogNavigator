/**
 * Tests for ontology tree sibling ordering by dictionary category.order.
 */
import { describe, expect, it } from 'vitest';
import type { TokenCategory } from './dictionaryTree';
import {
  compareSiblingSlots,
  orderSlotsDepthFirst,
} from './analysisTree';

const categories: TokenCategory[] = [
  { id: 'c1', name: 'specialità', order: 0, tokenTexts: ['angiologica'] },
  { id: 'c2', name: 'tipo visita', order: 1, tokenTexts: ['controllo'] },
  { id: 'c3', name: 'parte del corpo', order: 2, tokenTexts: ['arti', 'epiaortici'] },
];

describe('compareSiblingSlots', () => {
  it('orders controllo before arti by category.order (not alphabetically)', () => {
    expect(compareSiblingSlots('angiologica.controllo', 'angiologica.arti', categories)).toBeLessThan(0);
    expect(compareSiblingSlots('angiologica.arti', 'angiologica.controllo', categories)).toBeGreaterThan(0);
  });

  it('falls back to alphabetical when categories are missing', () => {
    expect(compareSiblingSlots('angiologica.arti', 'angiologica.controllo')).toBeLessThan(0);
  });
});

describe('orderSlotsDepthFirst', () => {
  it('lists siblings under angiologica by category.order', () => {
    const slots = [
      'angiologica',
      'angiologica.arti',
      'angiologica.controllo',
      'angiologica.epiaortici',
      'angiologica.arti.inferiori',
    ];

    expect(orderSlotsDepthFirst(slots, categories)).toEqual([
      'angiologica',
      'angiologica.controllo',
      'angiologica.arti',
      'angiologica.arti.inferiori',
      'angiologica.epiaortici',
    ]);
  });

  it('orders large flat forests without quadratic slowdown', () => {
    const leaves = Array.from({ length: 8_000 }, (_, i) => `brand-${i}.forma.dose`);
    const expanded = new Set<string>();
    for (const leaf of leaves) {
      const parts = leaf.split('.');
      for (let depth = 1; depth <= parts.length; depth += 1) {
        expanded.add(parts.slice(0, depth).join('.'));
      }
    }
    const started = performance.now();
    const ordered = orderSlotsDepthFirst([...expanded]);
    expect(ordered.length).toBeGreaterThan(leaves.length);
    expect(performance.now() - started).toBeLessThan(2_000);
  });
});
