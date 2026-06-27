import { describe, expect, it } from 'vitest';
import {
  containsAsWholeWord,
  inferExpectedOptionFromUserText,
  resolvePlanSignatureForChat,
} from './grammarTuningFromChat';
import { buildDisambiguationSignature } from './compileDisambiguationPlan';

describe('containsAsWholeWord', () => {
  it('matches agonistica inside non agonistica as whole word at suffix', () => {
    expect(containsAsWholeWord('non agonistica', 'agonistica')).toBe(true);
  });

  it('does not match ecg inside ecocolordoppler', () => {
    expect(containsAsWholeWord('ecocolordoppler', 'ecg')).toBe(false);
  });
});

describe('inferExpectedOptionFromUserText', () => {
  const options = ['none', 'step test', 'test da sforzo massimale'];

  it('prefers longest option whose tokens appear in user text', () => {
    expect(inferExpectedOptionFromUserText('test da sforzo', options)).toBe('test da sforzo massimale');
  });

  it('matches when user text is contained in option', () => {
    expect(inferExpectedOptionFromUserText('sforzo massimale', options)).toBe('test da sforzo massimale');
  });

  it('returns null when nothing matches', () => {
    expect(inferExpectedOptionFromUserText('visita cardiologica', options)).toBeNull();
  });
});

describe('resolvePlanSignatureForChat', () => {
  const options = ['none', 'step test', 'test da sforzo massimale'];
  const signature = buildDisambiguationSignature('test', options);

  it('falls back to category + option set when bubble signature differs', () => {
    const plan = {
      computedAt: null,
      messages: [{
        signature,
        categoryName: 'test',
        options,
        style: 'choice' as const,
        question: 'Domanda?',
        no_match_1: null,
        no_match_2: null,
        no_match_3: null,
      }],
    };
    const wrongSig = buildDisambiguationSignature('test', ['step test', 'test da sforzo massimale']);
    expect(resolvePlanSignatureForChat({
      disambiguationSignature: wrongSig,
      disambiguationCategory: 'test',
      disambiguationOptions: options,
    }, plan)).toBe(signature);
  });
});
