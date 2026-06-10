/**
 * Tests for contextual answer synonym seeding and alphabetical ordering.
 */
import { describe, expect, it } from 'vitest';
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

  it('child panel under prefix ambiguity includes affirmatives', () => {
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
    const slots = [
      'agonistica',
      'agonistica.certificato idoneita',
      'agonistica.certificato idoneita.pratica sportiva',
    ];
    const itemPaths = [
      'agonistica.certificato idoneita',
      'agonistica.certificato idoneita.pratica sportiva',
    ];
    const panels = seedDefaultPanels(
      buildInteractivePanels('agonistica.certificato idoneita', slots, itemPaths),
      'agonistica.certificato idoneita',
    );
    const parent = panels.find((p) => p.isParent)!;
    const child = panels.find((p) => !p.isParent)!;
    expect(parent.synonyms).not.toContain('agonistica certificato idoneita');
    expect(child.synonyms).toContain('sì');
    expect(child.synonyms).not.toContain('agonistica certificato idoneita pratica sportiva');
  });
});
