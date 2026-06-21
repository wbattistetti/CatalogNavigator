/**
 * Tests for grammar-aware design-time segmentation.
 */
import { describe, expect, it } from 'vitest';
import { applyCategoryGrammars } from './categoryGrammar';
import type { TokenCategory } from './dictionaryTree';
import { segmentDescriptionGrammarAware } from './grammarAwareSegment';
import type { TokenEntry } from './tokenDictionary';

describe('segmentDescriptionGrammarAware', () => {
  it('finds specialità via category grammar when synonym appears in text', () => {
    const categories: TokenCategory[] = [
      { id: 'c1', name: 'specialità', order: 0, tokenTexts: ['cardiologica'], type: 'attributo' },
      { id: 'c2', name: 'tipo visita', order: 1, tokenTexts: ['prima'], type: 'attributo' },
    ];
    const tokens: TokenEntry[] = [
      { text: 'cardiologica', enabled: true },
      { text: 'prima', enabled: true },
    ];
    const withGrammar = applyCategoryGrammars(categories, tokens, true);

    const result = segmentDescriptionGrammarAware(
      'visita cardiologica prima',
      tokens,
      withGrammar,
    );

    expect(result.path).toBe('cardiologica.prima');
    expect(result.segments).toEqual(['cardiologica', 'prima']);
  });

  it('falls back to phrase matching when no grammar is configured', () => {
    const tokens: TokenEntry[] = [
      { text: 'cardiologica', enabled: true },
      { text: 'prima', enabled: true },
    ];
    const categories: TokenCategory[] = [
      { id: 'c1', name: 'specialità', order: 0, tokenTexts: ['cardiologica'] },
      { id: 'c2', name: 'tipo visita', order: 1, tokenTexts: ['prima'] },
    ];

    const result = segmentDescriptionGrammarAware('cardiologica prima', tokens, categories);
    expect(result.path).toBe('cardiologica.prima');
  });

  it('keeps every matched token even when they share a category', () => {
    const categories: TokenCategory[] = [
      {
        id: 'c1',
        name: 'esame',
        order: 0,
        tokenTexts: ['ecg', 'ecocolordoppler cardiaco'],
        type: 'attributo',
      },
      {
        id: 'c2',
        name: 'specialità',
        order: 1,
        tokenTexts: ['cardiologica', 'pediatrica'],
        type: 'attributo',
      },
      {
        id: 'c3',
        name: 'tipo visita',
        order: 2,
        tokenTexts: ['prima', 'specialistica'],
        type: 'attributo',
      },
    ];
    const tokens: TokenEntry[] = [
      { text: 'ecg', enabled: true },
      { text: 'ecocolordoppler cardiaco', enabled: true },
      { text: 'cardiologica', enabled: true },
      { text: 'pediatrica', enabled: true },
      { text: 'prima', enabled: true },
      { text: 'specialistica', enabled: true },
    ];
    const withGrammar = applyCategoryGrammars(categories, tokens, true);

    const result = segmentDescriptionGrammarAware(
      'visita specialistica cardiologica pediatrica ecg ecocolordoppler cardiaco prima',
      tokens,
      withGrammar,
    );

    expect(result.segments).toEqual([
      'ecg',
      'ecocolordoppler cardiaco',
      'cardiologica',
      'pediatrica',
      'specialistica',
      'prima',
    ]);
    expect(result.path).toBe(
      'ecg.ecocolordoppler cardiaco.cardiologica.pediatrica.specialistica.prima',
    );
  });

  it('does not grammar-supplement agonistica when non agonistica already matched', () => {
    const categories: TokenCategory[] = [
      {
        id: 'c1',
        name: 'tipo certificato',
        order: 0,
        tokenTexts: ['certificato idoneita'],
        type: 'attributo',
      },
      {
        id: 'c2',
        name: 'pratica',
        order: 1,
        tokenTexts: ['pratica sportiva'],
        type: 'attributo',
      },
      {
        id: 'c3',
        name: 'agonismo',
        order: 2,
        tokenTexts: ['non agonistica', 'agonistica'],
        type: 'attributo',
      },
      {
        id: 'c4',
        name: 'esame',
        order: 3,
        tokenTexts: ['test da sforzo massimale'],
        type: 'attributo',
      },
    ];
    const tokens: TokenEntry[] = [
      { text: 'certificato idoneita', enabled: true },
      { text: 'pratica sportiva', enabled: true },
      { text: 'non agonistica', enabled: true },
      { text: 'agonistica', enabled: true },
      { text: 'test da sforzo massimale', enabled: true },
    ];
    const withGrammar = applyCategoryGrammars(categories, tokens, true);

    const result = segmentDescriptionGrammarAware(
      'certificato idoneita alla pratica sportiva non agonistica + test da sforzo massimale',
      tokens,
      withGrammar,
    );

    expect(result.segments).toContain('non agonistica');
    expect(result.segments).not.toContain('agonistica');
    expect(result.segments).toContain('test da sforzo massimale');
    expect(result.unmatched).not.toContain('+test');
  });

  it('segments step test when corpus row uses + prefix', () => {
    const categories: TokenCategory[] = [
      {
        id: 'c1',
        name: 'esame',
        order: 0,
        tokenTexts: ['step test'],
        type: 'attributo',
      },
    ];
    const tokens: TokenEntry[] = [{ text: 'step test', enabled: true }];
    const withGrammar = applyCategoryGrammars(categories, tokens, true);

    const result = segmentDescriptionGrammarAware(
      'certificato idoneita alla pratica sportiva agonistica + step test',
      tokens,
      withGrammar,
    );

    expect(result.segments).toContain('step test');
    expect(result.unmatched).not.toContain('+step');
  });

  it('grammar-supplements agonistica when it appears outside a longer match', () => {
    const categories: TokenCategory[] = [
      {
        id: 'c1',
        name: 'agonismo',
        order: 0,
        tokenTexts: ['non agonistica', 'agonistica'],
        type: 'attributo',
      },
    ];
    const tokens: TokenEntry[] = [
      { text: 'non agonistica', enabled: true },
      { text: 'agonistica', enabled: true },
    ];
    const withGrammar = applyCategoryGrammars(categories, tokens, true);

    const result = segmentDescriptionGrammarAware(
      'agonistica e non agonistica',
      tokens,
      withGrammar,
    );

    expect(result.segments).toContain('non agonistica');
    expect(result.segments).toContain('agonistica');
  });

  it('ignores stale category grammar for a deleted token', () => {
    const categories: TokenCategory[] = [
      {
        id: 'c1',
        name: 'esame',
        order: 0,
        tokenTexts: ['ecodoppler'],
        type: 'attributo',
        grammar: {
          regex: '(?<vasi>vasi)|(?<ecodoppler>ecodoppler)',
          mappings: { vasi: 'vasi', ecodoppler: 'ecodoppler' },
        },
      },
    ];
    const tokens: TokenEntry[] = [{ text: 'ecodoppler', enabled: true }];

    const result = segmentDescriptionGrammarAware(
      'ecodoppler vasi epiaortici',
      tokens,
      categories,
    );

    expect(result.path).toBe('ecodoppler');
    expect(result.segments).toEqual(['ecodoppler']);
  });
});
