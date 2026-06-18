/**
 * Tests for per-turn expectedInput contracts.
 */
import { describe, expect, it } from 'vitest';
import { withExpectedInput } from './agentTurnExpectedInput';

describe('withExpectedInput', () => {
  it('adds age_years contract for ask_age', () => {
    const instruction = withExpectedInput({
      action: 'ask_age',
      categoryName: 'fascia di età',
    });
    expect(instruction.expectedInput?.slots).toHaveLength(1);
    expect(instruction.expectedInput?.slots[0]?.valueKind).toBe('age_years');
    expect(instruction.expectedInput?.slots[0]?.categoryName).toBe('fascia di età');
    expect(instruction.expectedInput?.slots[0]?.description).toContain('30');
  });

  it('adds canonical_token contract for disambiguate', () => {
    const instruction = withExpectedInput({
      action: 'disambiguate',
      categoryName: 'target',
      options: ['adulto', 'pediatrica'],
    });
    expect(instruction.expectedInput?.slots[0]?.valueKind).toBe('canonical_token');
    expect(instruction.expectedInput?.slots[0]?.description).toContain('adulto');
  });
});
