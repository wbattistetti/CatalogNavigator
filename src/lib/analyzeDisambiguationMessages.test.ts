/**
 * Tests for disambiguation message AI parsing.
 */
import { describe, expect, it } from 'vitest';
import type { DisambiguationEditorRow } from './disambiguationPlanMessages';
import {
  disambiguationMessageId,
  parseDisambiguationAiContent,
  processDisambiguationMessagesAiResponse,
} from './analyzeDisambiguationMessages';

const targetRow: DisambiguationEditorRow = {
  signature: 'tipo visita||controllo|prima visita||choice',
  categoryName: 'tipo visita',
  options: ['controllo', 'prima visita'],
  style: 'choice',
  question: null,
  no_match_1: null,
  no_match_2: null,
  no_match_3: null,
  contextCount: 2,
  nodeKeys: ['k1', 'k2'],
  sampleAcquired: {},
};

describe('parseDisambiguationAiContent', () => {
  it('accepts { messages: [...] } format from the disambiguation prompt', () => {
    const raw = JSON.stringify({
      messages: [{
        signature: targetRow.signature,
        question: 'È una prima visita o un controllo?',
        no_match_1: 'Non ho capito.',
        no_match_2: 'Può ripetere?',
        no_match_3: 'Prima visita o controllo?',
      }],
    });

    const parsed = parseDisambiguationAiContent(raw);
    expect(parsed).toEqual({
      messages: [{
        signature: targetRow.signature,
        question: 'È una prima visita o un controllo?',
        no_match_1: 'Non ho capito.',
        no_match_2: 'Può ripetere?',
        no_match_3: 'Prima visita o controllo?',
      }],
    });
  });

  it('rejects responses without a messages or rows array', () => {
    const raw = JSON.stringify({ grammar: { tac: { regex: '.*', mappings: {} } } });

    expect(() => parseDisambiguationAiContent(raw)).toThrow(/messages.*signature/i);
  });
});

describe('processDisambiguationMessagesAiResponse', () => {
  it('maps AI messages back to target signatures', () => {
    const result = processDisambiguationMessagesAiResponse([targetRow], {
      messages: [{
        signature: targetRow.signature,
        question: 'È una prima visita o un controllo?',
      }],
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.signature).toBe(targetRow.signature);
    expect(result[0]?.question).toBe('È una prima visita o un controllo?');
    expect(result[0]?.source).toBe('ai');
  });

  it('matches by short id when signature echo is omitted', () => {
    const result = processDisambiguationMessagesAiResponse([targetRow], {
      messages: [{
        id: disambiguationMessageId(0),
        question: 'Prima visita o controllo?',
      }],
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.question).toBe('Prima visita o controllo?');
  });
});
