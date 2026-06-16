/**
 * Tests for age constraint token parsing.
 */
import { describe, expect, it } from 'vitest';
import { formatAgeConstraintKbValue, parseAgeConstraintToken } from './ageConstraintParse';

describe('parseAgeConstraintToken', () => {
  it('parses closed range', () => {
    expect(parseAgeConstraintToken('da 6 anni a 15 anni')).toEqual({ min: 6, max: 15 });
    expect(parseAgeConstraintToken('dai 6 ai 15')).toEqual({ min: 6, max: 15 });
  });

  it('parses minimum-only bands', () => {
    expect(parseAgeConstraintToken('dai 16 anni')).toEqual({ min: 16, max: null });
    expect(parseAgeConstraintToken('over 17 anni')).toEqual({ min: 18, max: null });
    expect(parseAgeConstraintToken('> 17 anni')).toEqual({ min: 18, max: null });
  });

  it('returns null for unrecognized text', () => {
    expect(parseAgeConstraintToken('prima visita')).toBeNull();
  });
});

describe('formatAgeConstraintKbValue', () => {
  it('appends età_min and età_max when parseable', () => {
    expect(formatAgeConstraintKbValue('da 6 anni a 15 anni'))
      .toBe('da 6 anni a 15 anni | età_min: 6 | età_max: 15');
    expect(formatAgeConstraintKbValue('dai 16 anni'))
      .toBe('dai 16 anni | età_min: 16 | età_max: null');
  });
});
