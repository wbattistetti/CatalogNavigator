/**
 * Tests for category-aware NLU sibling and prefix rules.
 */
import { describe, expect, it } from 'vitest';
import type { TokenCategory } from './dictionaryTree';
import {
  findSiblingChoiceGroup,
  getSiblingChoiceChildren,
  getPrefixAmbiguityTargets,
  hasAttributoPrefixAmbiguity,
  requiresCategoryAwareInteractiveNode,
  requiresVincoloSegmentQuestionNode,
} from './nluCategoryRules';
import { isPrefixAmbiguityNode } from './itemPaths';
import { applyNluQuestionRules } from './nluQuestionRules';
import { AGE_YEARS_QUESTION } from './constraintValidation';

const categories: TokenCategory[] = [
  { id: 'c1', name: 'specialità', order: 0, tokenTexts: ['allergologica'] },
  { id: 'c2', name: 'tipo visita', order: 1, tokenTexts: ['controllo', 'prima'] },
  { id: 'c3', name: 'fascia di età', order: 2, tokenTexts: ['>3 anni'], type: 'vincolo' },
  { id: 'c4', name: 'inclusione', order: 3, tokenTexts: ['incluso prick test'] },
  { id: 'c5', name: 'target', order: 4, tokenTexts: ['per alimenti', 'per inalanti'] },
];

const slots = [
  'allergologica',
  'allergologica.controllo',
  'allergologica.controllo.>3 anni',
  'allergologica.controllo.>3 anni.incluso prick test',
  'allergologica.controllo.>3 anni.incluso prick test.per alimenti',
  'allergologica.controllo.>3 anni.incluso prick test.per inalanti',
  'allergologica.prima',
];

const itemPaths = [
  'allergologica.controllo.>3 anni.incluso prick test.per alimenti',
  'allergologica.controllo.>3 anni.incluso prick test.per inalanti',
  'allergologica.prima',
];

describe('findSiblingChoiceGroup', () => {
  it('groups controllo and prima under allergologica (same category)', () => {
    const group = findSiblingChoiceGroup(slots, 'allergologica', categories);
    expect(group?.children.map((c) => c.split('.').pop())).toEqual(['controllo', 'prima']);
  });

  it('does not treat vincolo and attributo as siblings under controllo', () => {
    const mixedSlots = [
      ...slots,
      'allergologica.controllo.incluso prick test',
    ];
    expect(findSiblingChoiceGroup(mixedSlots, 'allergologica.controllo', categories)).toBeNull();
  });

  it('offers per alimenti vs per inalanti under incluso prick test', () => {
    const group = findSiblingChoiceGroup(
      slots,
      'allergologica.controllo.>3 anni.incluso prick test',
      categories,
    );
    expect(group?.children.map((c) => c.split('.').pop())).toEqual(['per alimenti', 'per inalanti']);
  });
});

describe('requiresCategoryAwareInteractiveNode', () => {
  it('does not mark controllo interactive when only deep item extensions exist', () => {
    expect(isPrefixAmbiguityNode(slots, 'allergologica.controllo', itemPaths)).toBe(false);
    expect(requiresCategoryAwareInteractiveNode(
      slots,
      'allergologica.controllo',
      itemPaths,
      categories,
    )).toBe(false);
  });

  it('marks vincolo segment node interactive for age question', () => {
    const slot = 'allergologica.controllo.>3 anni';
    expect(requiresVincoloSegmentQuestionNode(slot, itemPaths, categories)).toBe(true);
    expect(requiresCategoryAwareInteractiveNode(slots, slot, itemPaths, categories)).toBe(true);
  });

  it('marks incluso prick test interactive for target siblings', () => {
    const slot = 'allergologica.controllo.>3 anni.incluso prick test';
    expect(requiresCategoryAwareInteractiveNode(slots, slot, itemPaths, categories)).toBe(true);
    expect(getSiblingChoiceChildren(slots, slot, categories)?.length).toBe(2);
  });
});

describe('applyNluQuestionRules', () => {
  it('does not build prefix question on controllo with only deep leaves', () => {
    const rows = slots.map((slot_filling) => ({
      slot_filling,
      question: null,
      grammar: null,
      answer_grammar: null,
      no_match_1: null,
      no_match_2: null,
      no_match_3: null,
      confirmation_text: null,
      status: null,
    }));
    const out = applyNluQuestionRules(slots, rows, itemPaths, categories);
    const controllo = out.find((r) => r.slot_filling === 'allergologica.controllo');
    expect(controllo?.question).toBeNull();
  });

  it('asks patient age on vincolo segment node (>3 anni)', () => {
    const rows = slots.map((slot_filling) => ({
      slot_filling,
      question: null,
      grammar: null,
      answer_grammar: null,
      no_match_1: null,
      no_match_2: null,
      no_match_3: null,
      confirmation_text: null,
      status: null,
    }));
    const out = applyNluQuestionRules(slots, rows, itemPaths, categories);
    const vincolo = out.find((r) => r.slot_filling === 'allergologica.controllo.>3 anni');
    expect(vincolo?.question).toBe(AGE_YEARS_QUESTION);
  });

  it('builds sibling question on incluso prick test', () => {
    const rows = slots.map((slot_filling) => ({
      slot_filling,
      question: null,
      grammar: null,
      answer_grammar: null,
      no_match_1: null,
      no_match_2: null,
      no_match_3: null,
      confirmation_text: null,
      status: null,
    }));
    const out = applyNluQuestionRules(slots, rows, itemPaths, categories);
    const node = out.find((r) => r.slot_filling === 'allergologica.controllo.>3 anni.incluso prick test');
    expect(node?.question).toContain('per alimenti');
    expect(node?.question).toContain('per inalanti');
    expect(node?.question).not.toContain('controllo semplice');
  });
});

describe('vincolo segment messages', () => {
  const vincoloCategories: TokenCategory[] = [
    { id: 'c1', name: 'tipo visita', order: 0, tokenTexts: ['controllo'] },
    { id: 'c2', name: 'fascia di età', order: 1, tokenTexts: ['> 17 anni'], type: 'vincolo' },
  ];

  const vincoloSlots = [
    'ecodoppler.controllo',
    'ecodoppler.controllo.> 17 anni',
  ];

  const vincoloItemPaths = [
    'ecodoppler.controllo',
    'ecodoppler.controllo.> 17 anni',
  ];

  it('does not offer vincolo in prefix targets on controllo', () => {
    expect(isPrefixAmbiguityNode(vincoloSlots, 'ecodoppler.controllo', vincoloItemPaths)).toBe(true);
    expect(hasAttributoPrefixAmbiguity(vincoloSlots, 'ecodoppler.controllo', vincoloItemPaths, vincoloCategories)).toBe(false);
    expect(requiresVincoloSegmentQuestionNode('ecodoppler.controllo', vincoloItemPaths, vincoloCategories)).toBe(false);
    expect(requiresVincoloSegmentQuestionNode('ecodoppler.controllo.> 17 anni', vincoloItemPaths, vincoloCategories)).toBe(true);
    expect(getPrefixAmbiguityTargets('ecodoppler.controllo', vincoloItemPaths, vincoloCategories)).toEqual([]);
  });

  it('asks patient age on vincolo child, not on controllo parent', () => {
    const rows = vincoloSlots.map((slot_filling) => ({
      slot_filling,
      question: slot_filling === 'ecodoppler.controllo'
        ? 'Vuole controllo semplice o anche > 17 anni?'
        : null,
      grammar: null,
      answer_grammar: null,
      no_match_1: null,
      no_match_2: null,
      no_match_3: null,
      confirmation_text: null,
      status: null,
    }));
    const out = applyNluQuestionRules(vincoloSlots, rows, vincoloItemPaths, vincoloCategories);
    const controllo = out.find((r) => r.slot_filling === 'ecodoppler.controllo');
    const vincolo = out.find((r) => r.slot_filling === 'ecodoppler.controllo.> 17 anni');
    expect(controllo?.question).toBeNull();
    expect(vincolo?.question).toBe(AGE_YEARS_QUESTION);
  });

  it('prefix question lists only attributo child when mixed with vincolo', () => {
    const mixedSlots = [
      'x.controllo',
      'x.controllo.> 17 anni',
      'x.controllo.incluso prick test',
    ];
    const mixedItemPaths = [
      'x.controllo',
      'x.controllo.> 17 anni',
      'x.controllo.incluso prick test',
    ];
    const mixedCategories: TokenCategory[] = [
      { id: 'c1', name: 'tipo', order: 0, tokenTexts: ['controllo'] },
      { id: 'c2', name: 'fascia di età', order: 1, tokenTexts: ['> 17 anni'], type: 'vincolo' },
      { id: 'c3', name: 'inclusione', order: 2, tokenTexts: ['incluso prick test'] },
    ];

    expect(requiresVincoloSegmentQuestionNode('x.controllo', mixedItemPaths, mixedCategories)).toBe(false);
    expect(hasAttributoPrefixAmbiguity(mixedSlots, 'x.controllo', mixedItemPaths, mixedCategories)).toBe(true);
    expect(getPrefixAmbiguityTargets('x.controllo', mixedItemPaths, mixedCategories)).toEqual(['x.controllo.incluso prick test']);

    const rows = mixedSlots.map((slot_filling) => ({
      slot_filling,
      question: null,
      grammar: null,
      answer_grammar: null,
      no_match_1: null,
      no_match_2: null,
      no_match_3: null,
      confirmation_text: null,
      status: null,
    }));
    const out = applyNluQuestionRules(mixedSlots, rows, mixedItemPaths, mixedCategories);
    const controllo = out.find((r) => r.slot_filling === 'x.controllo');
    expect(controllo?.question).toContain('incluso prick test');
    expect(controllo?.question).not.toContain('> 17 anni');
  });
});
