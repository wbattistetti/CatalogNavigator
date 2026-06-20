/**
 * Tests for chat user-turn recognition debug.
 */
import { describe, expect, it } from 'vitest';
import type { AgentBundle } from './agentBundleTypes';
import {
  buildUserTurnRecognition,
  formatUserTurnRecognitionSummary,
  resolvePendingDisambiguationContext,
  shouldAutoExpandUserTurnRecognition,
} from './chatUserTurnRecognition';

const bundle = {
  analysis: {
    disambiguation_plan: {
      computedAt: null,
      messages: [{
        signature: 'esame||ecg||optional_include',
        categoryName: 'esame',
        options: ['ecg', 'none'],
        style: 'optional_include',
        question: 'Desidera includere l\'ECG?',
        no_match_1: null,
        no_match_2: null,
        no_match_3: null,
        answer_grammar: {
          regex: '(?<affirmative>sì|si)|(?<decline>no|niente)|(?<literal>ecg|none)',
          mappings: {
            affirmative: 'ecg',
            decline: 'none',
            literal: 'ecg',
          },
        },
      }],
    },
  },
} as unknown as AgentBundle;

describe('resolvePendingDisambiguationContext', () => {
  it('reads options from the latest agent disambiguation bubble', () => {
    const ctx = resolvePendingDisambiguationContext([
      { role: 'agent', disambiguationCategory: 'esame', disambiguationOptions: ['ecg', 'none'], disambiguationSignature: 'esame||ecg||optional_include' },
      { role: 'user', text: 'sì' } as { role: string },
    ]);
    expect(ctx?.categoryName).toBe('esame');
    expect(ctx?.options).toEqual(['ecg', 'none']);
  });
});

describe('buildUserTurnRecognition', () => {
  it('maps "sì" to positive option via plan answer grammar', () => {
    const recognition = buildUserTurnRecognition({
      userText: 'sì',
      bundle,
      vbParsed: [],
      pending: {
        signature: 'esame||ecg||optional_include',
        categoryName: 'esame',
        options: ['ecg', 'none'],
      },
    });
    expect(recognition?.grammarMatch?.selectedOption).toBe('ecg');
    expect(formatUserTurnRecognitionSummary(recognition!)).toContain('ecg');
    expect(shouldAutoExpandUserTurnRecognition(recognition)).toBe(false);
  });

  it('auto-expands when grammar and VB both miss', () => {
    const recognition = buildUserTurnRecognition({
      userText: 'boh',
      bundle,
      vbParsed: [],
      pending: {
        categoryName: 'esame',
        options: ['ecg', 'none'],
      },
    });
    expect(recognition?.grammarMatch).toBeNull();
    expect(shouldAutoExpandUserTurnRecognition(recognition)).toBe(true);
  });
});
