/**
 * Tests for contextual answer synonym seeding and alphabetical ordering.
 */
import { describe, expect, it } from 'vitest';
import type { TokenCategory } from './dictionaryTree';
import {
  buildInteractivePanels,
  defaultChildContextualSynonyms,
  defaultParentContextualSynonyms,
  seedDefaultPanels,
  sortSynonymsAlphabetically,
} from './grammarSynonyms';

describe('sortSynonymsAlphabetically', () => {
  it('sorts case-insensitively in Italian locale', () => {
    expect(sortSynonymsAlphabetically(['Solo', 'anche', 'No', 'semplice'])).toEqual([
      'anche',
      'No',
      'semplice',
      'Solo',
    ]);
  });
});

describe('contextual answer synonym seeds', () => {
  it('parent panel uses short contextual tokens, not full path tails', () => {
    const synonyms = defaultParentContextualSynonyms('agonistica.certificato idoneita');
    expect(synonyms).toContain('certificato idoneita');
    expect(synonyms).toContain('semplice');
    expect(synonyms).not.toContain('agonistica certificato idoneita');
  });

  it('child panel on binary choice includes affirmatives', () => {
    const synonyms = defaultChildContextualSynonyms(
      'agonistica.certificato idoneita.pratica sportiva',
      true,
    );
    expect(synonyms).toContain('pratica sportiva');
    expect(synonyms).toContain('sì');
    expect(synonyms).toContain('anche');
    expect(synonyms).not.toContain('agonistica certificato idoneita pratica sportiva');
  });

  it('seedDefaultPanels does not inject recognition path chains', () => {
    const categories: TokenCategory[] = [
      { id: 'c1', name: 'specialità', order: 0, tokenTexts: ['cardiologica'] },
      { id: 'c2', name: 'tipo visita', order: 1, tokenTexts: ['prima', 'visita'] },
    ];
    const slots = ['cardiologica', 'cardiologica.prima', 'cardiologica.visita'];
    const panels = seedDefaultPanels(
      buildInteractivePanels('cardiologica', slots, null, categories),
      'cardiologica',
    );
    expect(panels).toHaveLength(2);
    for (const panel of panels) {
      expect(panel.synonyms).not.toContain('cardiologica prima');
      expect(panel.synonyms).not.toContain('cardiologica visita');
    }
    expect(panels.some((p) => p.synonyms.includes('sì'))).toBe(true);
  });
});

describe('buildInteractivePanels category-aware', () => {
  const cardiologicaCategories: TokenCategory[] = [
    { id: 'c1', name: 'specialità', order: 0, tokenTexts: ['cardiologica'] },
    { id: 'c2', name: 'tipo visita', order: 1, tokenTexts: ['prima', 'visita'] },
    { id: 'c3', name: 'fascia', order: 2, tokenTexts: ['pediatrica'] },
  ];

  const slots = [
    'cardiologica',
    'cardiologica.prima',
    'cardiologica.visita',
    'cardiologica.pediatrica',
  ];

  it('lists only same-category siblings when categories are provided', () => {
    const tipoPanels = buildInteractivePanels('cardiologica', slots, null, cardiologicaCategories);
    expect(tipoPanels.map((p) => p.targetPath)).toEqual([
      'cardiologica.prima',
      'cardiologica.visita',
    ]);
    expect(tipoPanels.map((p) => p.targetPath)).not.toContain('cardiologica.pediatrica');
  });

  it('without categories falls back to all direct children', () => {
    const panels = buildInteractivePanels('cardiologica', slots, null);
    expect(panels.map((p) => p.targetPath)).toEqual([
      'cardiologica.prima',
      'cardiologica.visita',
      'cardiologica.pediatrica',
    ]);
  });
});
