/**
 * Tests for human-readable disambiguation context formatting.
 */
import { describe, expect, it } from 'vitest';
import type { TokenCategory } from './dictionaryTree';
import {
  buildDisambiguationTriggerSummary,
  buildLabeledAcquiredSlots,
  formatLabeledAcquiredInline,
  mergeAcquiredWithPathPrefix,
  resolveDisambiguationDisplayContext,
} from './disambiguationContextDisplay';

const categories: TokenCategory[] = [
  { id: 'c1', name: 'Specialità', order: 0, tokenTexts: ['cardiologica'] },
  { id: 'c2', name: 'Fascia di età', order: 1, tokenTexts: ['> 17 anni'], type: 'vincolo' },
  { id: 'c3', name: 'Prestazione', order: 2, tokenTexts: ['ecodoppler'] },
  { id: 'c4', name: 'Distretti anatomici', order: 3, tokenTexts: ['aorta', 'arti inferiori'] },
];

describe('mergeAcquiredWithPathPrefix', () => {
  it('adds path segments missing from acquired state', () => {
    const merged = mergeAcquiredWithPathPrefix(
      '> 17 anni.ecodoppler',
      { prestazione: 'ecodoppler' },
      categories,
    );
    expect(merged).toEqual({
      prestazione: 'ecodoppler',
      'fascia di eta': '> 17 anni',
    });
  });

  it('keeps acquired values when path repeats them', () => {
    const merged = mergeAcquiredWithPathPrefix(
      'cardiologica.ecodoppler',
      { specialita: 'cardiologica', prestazione: 'ecodoppler' },
      categories,
    );
    expect(merged.specialita).toBe('cardiologica');
    expect(merged.prestazione).toBe('ecodoppler');
  });
});

describe('buildLabeledAcquiredSlots', () => {
  it('orders slots by category order with human labels', () => {
    const slots = buildLabeledAcquiredSlots({
      prestazione: 'ecodoppler',
      specialita: 'cardiologica',
      'fascia di eta': '> 17 anni',
    }, categories);

    expect(slots.map((s) => s.label)).toEqual([
      'Specialità',
      'Fascia di età',
      'Prestazione',
    ]);
    expect(formatLabeledAcquiredInline(slots)).toBe(
      'Specialità: cardiologica · Fascia di età: > 17 anni · Prestazione: ecodoppler',
    );
  });
});

describe('resolveDisambiguationDisplayContext', () => {
  it('builds full author-facing context from path and partial acquired', () => {
    const display = resolveDisambiguationDisplayContext({
      pathPrefix: '> 17 anni.ecodoppler',
      acquired: { specialita: 'cardiologica', prestazione: 'ecodoppler' },
    }, categories);

    expect(display.inlineLabel).toContain('Specialità: cardiologica');
    expect(display.inlineLabel).toContain('Fascia di età: > 17 anni');
    expect(display.inlineLabel).toContain('Prestazione: ecodoppler');
    expect(display.pathPrefix).toBe('> 17 anni.ecodoppler');
    expect(display.summarySentence).toMatch(/paziente ha già indicato/i);
  });
});

describe('buildDisambiguationTriggerSummary', () => {
  it('mentions resolved vincoli separately from attributi', () => {
    const slots = buildLabeledAcquiredSlots({
      specialita: 'cardiologica',
      prestazione: 'ecodoppler',
      'fascia di eta': '> 17 anni',
    }, categories);
    expect(buildDisambiguationTriggerSummary(slots)).toMatch(/fascia di età > 17 anni/i);
  });
});
