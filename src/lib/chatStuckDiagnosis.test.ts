/**
 * Tests for chat stuck diagnosis helpers.
 */
import { describe, expect, it } from 'vitest';
import { buildChatStuckDiagnosis } from './chatStuckDiagnosis';
import type { UserTurnRecognition } from './chatUserTurnRecognition';

const baseRecognition: UserTurnRecognition = {
  categoryName: 'esame',
  options: ['ecografia+mammografia', 'none'],
  planOptions: ['incluso ecografia e mammografia', 'none'],
  vbParsed: [],
  grammarMatch: { selectedOption: 'incluso ecografia e mammografia' },
  grammarSource: 'plan',
  grammarMapsToRuntimeToken: false,
  pendingWasActive: true,
  aligned: false,
};

describe('buildChatStuckDiagnosis', () => {
  it('returns no reasons when turn did not no_match', () => {
    const { reasons } = buildChatStuckDiagnosis({
      recognition: baseRecognition,
      priorSession: null,
      vbResult: {
        ok: true,
        instruction: { action: 'confirm' },
        parsed: [{ category: 'esame', value: 'ecografia+mammografia' }],
      },
    });
    expect(reasons).toEqual([]);
  });

  it('flags plan vs runtime token mismatch', () => {
    const { reasons } = buildChatStuckDiagnosis({
      recognition: baseRecognition,
      priorSession: {
        acquiredConcepts: [],
        pendingExpectedInput: [{
          categoryName: 'esame',
          valueKind: 'canonical_token',
          description: '',
          allowedTokens: ['ecografia+mammografia', 'none'],
        }],
      },
      vbResult: {
        ok: true,
        instruction: { action: 'no_match' },
        parsed: [],
        candidateCount: 2,
        nextState: { acquiredConcepts: [], exactAttributoCategories: [] },
      },
      planOptions: baseRecognition.planOptions,
    });
    expect(reasons.some((r) => r.includes('Token piano messaggi'))).toBe(true);
    expect(reasons.some((r) => r.includes('incluso ecografia'))).toBe(true);
  });
});
