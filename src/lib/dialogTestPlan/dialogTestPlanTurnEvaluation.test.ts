/**
 * Tests for per-turn dialog test evaluation.
 */
import { describe, expect, it } from 'vitest';
import { evaluateTurnAfterResponse, turnHasRecognitionWarning } from './dialogTestPlanTurnEvaluation';
import type { DialogTestTurnRecord } from './dialogTestPlanTypes';

describe('turnHasRecognitionWarning', () => {
  it('does not warn on first turn without pending context', () => {
    expect(turnHasRecognitionWarning({ userText: 'ginecologica' })).toBe(false);
  });
});

describe('evaluateTurnAfterResponse', () => {
  it('fails when the engine repeats the same disambiguation question', () => {
    const record: DialogTestTurnRecord = {
      userText: 'prima',
      action: 'ask_age',
      disambiguationSignature: 'age||ask',
      spokenHint: 'Qual è l\'età del paziente?',
    };
    const result = evaluateTurnAfterResponse({
      record,
      pendingBeforeTurn: {
        categoryName: 'fascia età',
        options: ['16 anni'],
        signature: 'age||ask',
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/ripetuta/i);
    }
  });
});
