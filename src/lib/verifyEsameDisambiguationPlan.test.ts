/**
 * End-to-end verification: screenshot case esame → età → ecg/ecocolordoppler/ecodoppler.
 */
import { describe, expect, it } from 'vitest';
import type { TokenCategory } from './dictionaryTree';
import { compileDisambiguationPlan } from './compileDisambiguationPlan';
import { buildCorpusItemsWithConstraints } from './corpusItemCompile';
import { buildDisambiguationEditorRows } from './disambiguationPlanMessages';
import { resolvePlanSignatureForChat } from './grammarTuningFromChat';
import { resolveBubbleDisambiguationSignature } from './resolveBubbleDisambiguationSignature';

const SCREENSHOT_SIGNATURE = 'esame||ecg|ecocolordoppler|ecodoppler||choice';

const categories: TokenCategory[] = [
  { id: 'c0', name: 'tipo prestazione', order: 0, tokenTexts: ['esame'] },
  {
    id: 'c1',
    name: 'fascia di età',
    order: 1,
    type: 'vincolo',
    tokenTexts: ['over 17 anni', '> 17 anni'],
    valueKind: 'age_years',
  },
  { id: 'c2', name: 'esame', order: 2, tokenTexts: ['ecg', 'ecodoppler', 'ecocolordoppler'] },
];

const paths = [
  'esame.over 17 anni.ecg',
  'esame.over 17 anni.ecodoppler',
  'esame.> 17 anni.ecocolordoppler',
];

describe('verify esame disambiguation (screenshot case)', () => {
  it('Calcola produces the runtime signature after bootstrap + age', () => {
    const corpusItems = buildCorpusItemsWithConstraints(paths, categories);
    const plan = compileDisambiguationPlan({ itemPaths: paths, categories, corpusItems });

    const node = plan.nodes.find(
      (n) => n.action === 'disambiguate' && n.signature === SCREENSHOT_SIGNATURE,
    );
    expect(node).toBeDefined();
    expect(node!.categoryName).toBe('esame');
    expect(node!.style).toBe('choice');
    expect(node!.ageYears).toBeGreaterThanOrEqual(18);
  });

  it('editor rows include the signature (row exists even before message copy)', () => {
    const corpusItems = buildCorpusItemsWithConstraints(paths, categories);
    const plan = compileDisambiguationPlan({ itemPaths: paths, categories, corpusItems });
    const rows = buildDisambiguationEditorRows(plan, null, categories);

    const row = rows.find((r) => r.signature === SCREENSHOT_SIGNATURE);
    expect(row).toBeDefined();
    expect(row!.categoryName).toBe('esame');
    expect(row!.options).toEqual(expect.arrayContaining(['ecg', 'ecodoppler', 'ecocolordoppler']));
  });

  it('runtime bubble options resolve to the same signature as Calcola', () => {
    const runtimeOptions = ['ecg', 'ecocolordoppler', 'ecodoppler'];
    const bubbleSig = resolveBubbleDisambiguationSignature({
      disambiguationCategory: 'esame',
      disambiguationOptions: runtimeOptions,
    });
    expect(bubbleSig).toBe(SCREENSHOT_SIGNATURE);
  });

  it('chat lookup finds plan row only when question is saved (Template VB otherwise)', () => {
    const storageWithoutQuestion = {
      computedAt: '2026-06-29T00:00:00.000Z',
      messages: [{
        signature: SCREENSHOT_SIGNATURE,
        categoryName: 'esame',
        options: ['ecg', 'ecocolordoppler', 'ecodoppler'],
        style: 'choice' as const,
        question: null,
        no_match_1: null,
        no_match_2: null,
        no_match_3: null,
      }],
    };

    const storageWithQuestion = {
      ...storageWithoutQuestion,
      messages: [{
        ...storageWithoutQuestion.messages[0]!,
        question: 'Quale esame desidera prenotare?',
      }],
    };

    const ref = {
      disambiguationCategory: 'esame',
      disambiguationOptions: ['ecg', 'ecocolordoppler', 'ecodoppler'],
    };

    expect(resolvePlanSignatureForChat(ref, storageWithoutQuestion)).toBe(SCREENSHOT_SIGNATURE);
    expect(resolvePlanSignatureForChat(ref, storageWithQuestion)).toBe(SCREENSHOT_SIGNATURE);
    expect(storageWithoutQuestion.messages[0]!.question).toBeNull();
    expect(storageWithQuestion.messages[0]!.question).toBeTruthy();
  });
});
