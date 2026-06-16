/**
 * Tests for runtime turn-answer grammars.
 */
import { describe, expect, it } from 'vitest';
import { compileTurnAnswerGrammar, matchTurnAnswerGrammar, NONE_CANONICAL } from './turnAnswerGrammar';

describe('compileTurnAnswerGrammar', () => {
  it('maps "no" to NONE option', () => {
    const grammar = compileTurnAnswerGrammar(['con ecg', NONE_CANONICAL])!;
    const match = matchTurnAnswerGrammar('no', grammar);
    expect(match?.selectedOption).toBe(NONE_CANONICAL);
  });

  it('maps affirmative answer to first option', () => {
    const grammar = compileTurnAnswerGrammar(['adulto', 'pediatrica'])!;
    const match = matchTurnAnswerGrammar('adulto', grammar);
    expect(match?.selectedOption).toBe('adulto');
  });
});
