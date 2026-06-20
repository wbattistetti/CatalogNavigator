/**
 * Tests for VB chat stuck-turn debug payloads.
 */
import { describe, expect, it } from 'vitest';
import type { AgentBundle } from './agentBundleTypes';
import { buildChatTurnDebug, shouldAutoExpandTurnDebug } from './chatTurnDebug';

const bundle = {
  dictionary: {
    descriptionColumn: 'desc',
    tokens: [],
    categories: [
      { id: 'c1', name: 'esami', order: 0, tokenTexts: ['ecg', 'eco'], type: 'attributo' },
    ],
  },
  corpusItems: [
    {
      path: 'visita.ecg',
      sourceText: 'visita ecg',
      segments: [
        { text: 'visita', categoryName: 'tipo', categoryType: 'attributo' },
        { text: 'ecg', categoryName: 'esami', categoryType: 'attributo' },
      ],
      unmatched: [],
      constraints: [],
    },
    {
      path: 'visita.eco',
      sourceText: 'visita eco',
      segments: [
        { text: 'visita', categoryName: 'tipo', categoryType: 'attributo' },
        { text: 'eco', categoryName: 'esami', categoryType: 'attributo' },
      ],
      unmatched: [],
      constraints: [],
    },
  ],
} as unknown as AgentBundle;

describe('buildChatTurnDebug', () => {
  it('builds stuck debug for no_match with multiple candidates', () => {
    const debug = buildChatTurnDebug({
      ok: true,
      instruction: { action: 'no_match' },
      candidateCount: 2,
      candidatePaths: ['visita.ecg', 'visita.eco'],
      parsed: [{ category: 'tipo', value: 'visita' }],
      nextState: { acquiredConcepts: [], selectedPath: null, noMatchCount: 1 },
      debug: { log: 'NO_MATCH', parsedBlock: '---PARSED---\nPROSSIMA_AZIONE: no_match' },
    }, bundle);

    expect(debug?.label).toContain('STUCK');
    expect(debug?.candidatePaths).toHaveLength(2);
    expect(debug?.attributoAnalysis.some((r) => r.categoryName === 'esami' && r.wouldAsk)).toBe(true);
    expect(shouldAutoExpandTurnDebug(debug)).toBe(true);
  });

  it('returns undefined for non no_match turns', () => {
    expect(buildChatTurnDebug({
      ok: true,
      instruction: { action: 'disambiguate', options: ['a', 'b'] },
    }, bundle)).toBeUndefined();
  });
});
