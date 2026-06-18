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

  it('maps "no" to literal none token', () => {
    const grammar = compileTurnAnswerGrammar(['ecg', 'none'])!;
    const match = matchTurnAnswerGrammar('no', grammar);
    expect(match?.selectedOption).toBe('none');
  });

  it('maps "nessuno" to none token', () => {
    const grammar = compileTurnAnswerGrammar(['ecodoppler', 'none'])!;
    const match = matchTurnAnswerGrammar('nessuno', grammar);
    expect(match?.selectedOption).toBe('none');
  });

  it('maps "sì" to real option when paired with none', () => {
    const grammar = compileTurnAnswerGrammar(['ecg', 'none'])!;
    const match = matchTurnAnswerGrammar('sì', grammar);
    expect(match?.selectedOption).toBe('ecg');
  });

  it('maps "ecodoppler" to real option when paired with none', () => {
    const grammar = compileTurnAnswerGrammar(['ecodoppler', 'none'])!;
    const match = matchTurnAnswerGrammar('ecodoppler', grammar);
    expect(match?.selectedOption).toBe('ecodoppler');
  });

  it('maps affirmative answer to first option', () => {
    const grammar = compileTurnAnswerGrammar(['adulto', 'pediatrica'])!;
    const match = matchTurnAnswerGrammar('adulto', grammar);
    expect(match?.selectedOption).toBe('adulto');
  });
});
