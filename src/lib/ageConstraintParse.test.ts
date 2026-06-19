/**
 * Tests for age constraint token parsing.
 */
import { describe, expect, it } from 'vitest';
import { formatAgeConstraintKbValue, parseAgeConstraintToken } from './ageConstraintParse';

describe('parseAgeConstraintToken', () => {
  it('parses closed year ranges', () => {
    expect(parseAgeConstraintToken('da 6 anni a 15 anni')).toEqual({
      min: 6,
      max: 15,
      minMonths: 72,
      maxMonths: 191,
    });
    expect(parseAgeConstraintToken('dai 6 ai 15')).toEqual({
      min: 6,
      max: 15,
      minMonths: 72,
      maxMonths: 191,
    });
  });

  it('parses minimum-only bands', () => {
    expect(parseAgeConstraintToken('dai 16 anni')).toEqual({
      min: 16,
      max: null,
      minMonths: 192,
      maxMonths: null,
    });
    expect(parseAgeConstraintToken('over 17 anni')).toEqual({
      min: 18,
      max: null,
      minMonths: 216,
      maxMonths: null,
    });
    expect(parseAgeConstraintToken('> 17 anni')).toEqual({
      min: 18,
      max: null,
      minMonths: 216,
      maxMonths: null,
    });
  });

  it('parses neonatal and infant tokens from the cardiologia catalog', () => {
    expect(parseAgeConstraintToken('0 1 anno')).toEqual({
      min: 0,
      max: 1,
      minMonths: 0,
      maxMonths: 23,
    });
    expect(parseAgeConstraintToken('da 0 fino a 1 anno')).toEqual({
      min: 0,
      max: 1,
      minMonths: 0,
      maxMonths: 23,
    });
    expect(parseAgeConstraintToken('entro le prime 4 settimane di vita')).toEqual({
      min: 0,
      max: 0,
      minMonths: 0,
      maxMonths: 0,
    });
  });

  it('parses month and week ranges', () => {
    expect(parseAgeConstraintToken('da 3 mesi a 12 mesi')).toEqual({
      min: 0,
      max: 1,
      minMonths: 3,
      maxMonths: 12,
    });
    expect(parseAgeConstraintToken('fino a 6 mesi')).toEqual({
      min: 0,
      max: 0,
      minMonths: 0,
      maxMonths: 6,
    });
    expect(parseAgeConstraintToken('entro 8 settimane')).toEqual({
      min: 0,
      max: 0,
      minMonths: 0,
      maxMonths: 1,
    });
  });

  it('parses tra, sotto, hyphen and spaced variants', () => {
    expect(parseAgeConstraintToken('tra 6 e 15 anni')).toEqual({
      min: 6,
      max: 15,
      minMonths: 72,
      maxMonths: 191,
    });
    expect(parseAgeConstraintToken('0-1 anno')).toEqual({
      min: 0,
      max: 1,
      minMonths: 0,
      maxMonths: 23,
    });
    expect(parseAgeConstraintToken('sotto i 3 anni')).toEqual({
      min: 0,
      max: 2,
      minMonths: 0,
      maxMonths: 35,
    });
  });

  it('returns null for unrecognized text', () => {
    expect(parseAgeConstraintToken('prima visita')).toBeNull();
  });
});

describe('formatAgeConstraintKbValue', () => {
  it('appends età_min, età_max and month bounds when parseable', () => {
    expect(formatAgeConstraintKbValue('da 6 anni a 15 anni'))
      .toBe('da 6 anni a 15 anni | età_min: 6 | età_max: 15 | età_min_mesi: 72 | età_max_mesi: 191');
    expect(formatAgeConstraintKbValue('dai 16 anni'))
      .toBe('dai 16 anni | età_min: 16 | età_max: null | età_min_mesi: 192 | età_max_mesi: null');
    expect(formatAgeConstraintKbValue('entro le prime 4 settimane di vita'))
      .toBe('entro le prime 4 settimane di vita | età_min: 0 | età_max: 0 | età_min_mesi: 0 | età_max_mesi: 0');
  });
});
