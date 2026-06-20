/**
 * Tests for disambiguation parent token derivation.
 */
import { describe, expect, it } from 'vitest';
import type { TokenCategory } from './dictionaryTree';
import { deriveDisambiguationParents, formatDisambiguationParentLines, resolveDisambiguationContextVariants } from './disambiguationParents';

const categories: TokenCategory[] = [
  { id: 'c1', name: 'specialità', order: 0, tokenTexts: ['cardiologica'] },
  { id: 'c2', name: 'prestazione', order: 1, tokenTexts: ['ecodoppler', 'ecg'] },
  { id: 'c3', name: 'varie', order: 2, tokenTexts: ['arterioso+venoso', 'venoso'] },
];

describe('deriveDisambiguationParents', () => {
  it('returns single parent when all paths share the same parent segment', () => {
    const info = deriveDisambiguationParents('varie', [
      'cardiologica.ecodoppler.arterioso+venoso',
      'cardiologica.ecodoppler.venoso',
    ], categories);

    expect(info.scope).toBe('single');
    expect(info.parents).toEqual(['ecodoppler']);
    expect(info.contextPrefixes).toEqual(['cardiologica.ecodoppler']);
    expect(info.parentCategoryName).toBe('prestazione');
  });

  it('returns multiple parents when paths diverge on parent segment', () => {
    const info = deriveDisambiguationParents('varie', [
      'cardiologica.ecodoppler.arterioso+venoso',
      'cardiologica.ecg.venoso',
    ], categories);

    expect(info.scope).toBe('multiple');
    expect(info.parents).toEqual(['ecg', 'ecodoppler']);
  });

  it('returns none when category segment is missing', () => {
    const info = deriveDisambiguationParents('varie', [
      'cardiologica.ecodoppler',
    ], categories);

    expect(info.scope).toBe('none');
    expect(info.parents).toHaveLength(0);
  });
});

describe('formatDisambiguationParentLines', () => {
  it('formats primary context prefix for single scope', () => {
    const lines = formatDisambiguationParentLines({
      parents: ['ecodoppler'],
      contextPrefixes: ['cardiologica.ecodoppler'],
      scope: 'single',
      parentCategoryName: 'prestazione',
    });
    expect(lines?.label).toBe('Contesto');
    expect(lines?.value).toBe('cardiologica.ecodoppler');
  });

  it('shows only the first prefix when multiple exist', () => {
    const lines = formatDisambiguationParentLines({
      parents: ['prima', 'prima'],
      contextPrefixes: [
        'cardiologica.> 17 anni.prima',
        'cardiologica.over 17 anni.prima',
      ],
      scope: 'multiple',
      parentCategoryName: 'tipo visita',
    });
    expect(lines?.value).toBe('cardiologica.> 17 anni.prima');
  });
});

describe('resolveDisambiguationContextVariants', () => {
  it('builds variants from parent prefixes when explicit list is absent', () => {
    const variants = resolveDisambiguationContextVariants({
      parents: ['prima'],
      contextPrefixes: ['cardiologica.> 17 anni.prima', 'cardiologica.over 17 anni.prima'],
      scope: 'multiple',
      parentCategoryName: 'tipo visita',
    });
    expect(variants).toHaveLength(2);
    expect(variants[0]?.pathPrefix).toBe('cardiologica.> 17 anni.prima');
  });
});
