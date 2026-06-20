/**
 * Tests for age constraint token parsing.
 */
import { describe, expect, it } from 'vitest';
import {
  formatAgeConstraintKbValue,
  formatVincoloBoundsLabel,
  parseAgeConstraintToken,
} from './ageConstraintParse';

describe('parseAgeConstraintToken', () => {
  it('parses closed year ranges', () => {
    expect(parseAgeConstraintToken('da 6 anni a 15 anni')).toEqual({
      min: 6,
      max: 15,
      minMonths: 72,
      maxMonths: 191,
      minWeeks: 312,
      maxWeeks: 831,
    });
    expect(parseAgeConstraintToken('dai 6 ai 15')).toEqual({
      min: 6,
      max: 15,
      minMonths: 72,
      maxMonths: 191,
      minWeeks: 312,
      maxWeeks: 831,
    });
  });

  it('parses minimum-only bands', () => {
    expect(parseAgeConstraintToken('dai 16 anni')).toEqual({
      min: 16,
      max: null,
      minMonths: 192,
      maxMonths: null,
      minWeeks: 832,
      maxWeeks: null,
    });
    expect(parseAgeConstraintToken('over 17 anni')).toEqual({
      min: 18,
      max: null,
      minMonths: 216,
      maxMonths: null,
      minWeeks: 936,
      maxWeeks: null,
    });
    expect(parseAgeConstraintToken('> 17 anni')).toEqual({
      min: 18,
      max: null,
      minMonths: 216,
      maxMonths: null,
      minWeeks: 936,
      maxWeeks: null,
    });
  });

  it('parses compound over-under tokens', () => {
    expect(parseAgeConstraintToken('over 1 anno under 17 anni')).toEqual({
      min: 2,
      max: 16,
      minMonths: 24,
      maxMonths: 203,
      minWeeks: 104,
      maxWeeks: 883,
    });
  });

  it('parses neonatal and infant tokens from the cardiologia catalog', () => {
    expect(parseAgeConstraintToken('0 1 anno')).toEqual({
      min: 0,
      max: 1,
      minMonths: 0,
      maxMonths: 23,
      minWeeks: 0,
      maxWeeks: 103,
    });
    expect(parseAgeConstraintToken('da 0 fino a 1 anno')).toEqual({
      min: 0,
      max: 1,
      minMonths: 0,
      maxMonths: 23,
      minWeeks: 0,
      maxWeeks: 103,
    });
    expect(parseAgeConstraintToken('entro le prime 4 settimane di vita')).toEqual({
      min: 0,
      max: 0,
      minMonths: 0,
      maxMonths: 0,
      minWeeks: 0,
      maxWeeks: 4,
    });
  });

  it('parses month and week ranges', () => {
    expect(parseAgeConstraintToken('da 3 mesi a 12 mesi')).toEqual({
      min: 0,
      max: 1,
      minMonths: 3,
      maxMonths: 12,
      minWeeks: 13,
      maxWeeks: 55,
    });
    expect(parseAgeConstraintToken('fino a 6 mesi')).toEqual({
      min: 0,
      max: 0,
      minMonths: 0,
      maxMonths: 6,
      minWeeks: 0,
      maxWeeks: 29,
    });
    expect(parseAgeConstraintToken('entro 8 settimane')).toEqual({
      min: 0,
      max: 0,
      minMonths: 0,
      maxMonths: 1,
      minWeeks: 0,
      maxWeeks: 8,
    });
  });

  it('parses tra, sotto, hyphen and spaced variants', () => {
    expect(parseAgeConstraintToken('tra 6 e 15 anni')).toEqual({
      min: 6,
      max: 15,
      minMonths: 72,
      maxMonths: 191,
      minWeeks: 312,
      maxWeeks: 831,
    });
    expect(parseAgeConstraintToken('0-1 anno')).toEqual({
      min: 0,
      max: 1,
      minMonths: 0,
      maxMonths: 23,
      minWeeks: 0,
      maxWeeks: 103,
    });
    expect(parseAgeConstraintToken('sotto i 3 anni')).toEqual({
      min: 0,
      max: 2,
      minMonths: 0,
      maxMonths: 35,
      minWeeks: 0,
      maxWeeks: 155,
    });
  });

  it('returns null for unrecognized text', () => {
    expect(parseAgeConstraintToken('prima visita')).toBeNull();
  });

  it('parses cardiologia catalog variants (dalle, di vita, prefissi, rumore finale)', () => {
    const fiveWeeksToOneYear = {
      min: 0,
      max: 1,
      minMonths: 1,
      maxMonths: 23,
      minWeeks: 5,
      maxWeeks: 103,
    };

    expect(parseAgeConstraintToken('da 5 settimane fino a 1 anno di vita')).toEqual(fiveWeeksToOneYear);
    expect(parseAgeConstraintToken('dalle 5 settimane di vita fino a 1 anno')).toEqual(fiveWeeksToOneYear);
    expect(parseAgeConstraintToken('da 5 settimane di vita fino a 1 anno 51 settimane')).toEqual(fiveWeeksToOneYear);
    expect(parseAgeConstraintToken('ecg da 0 fino a 1 anno')).toEqual({
      min: 0,
      max: 1,
      minMonths: 0,
      maxMonths: 23,
      minWeeks: 0,
      maxWeeks: 103,
    });
    expect(parseAgeConstraintToken('ecg da over 1 anno under 16 anni')).toEqual({
      min: 2,
      max: 15,
      minMonths: 24,
      maxMonths: 191,
      minWeeks: 104,
      maxWeeks: 831,
    });
    expect(parseAgeConstraintToken('>3 anni')).toEqual({
      min: 4,
      max: null,
      minMonths: 48,
      maxMonths: null,
      minWeeks: 208,
      maxWeeks: null,
    });
    expect(parseAgeConstraintToken('da 12 a 15 anni')).toEqual({
      min: 12,
      max: 15,
      minMonths: 144,
      maxMonths: 191,
      minWeeks: 624,
      maxWeeks: 831,
    });
    expect(parseAgeConstraintToken('da 15 anni')).toEqual({
      min: 15,
      max: null,
      minMonths: 180,
      maxMonths: null,
      minWeeks: 780,
      maxWeeks: null,
    });
  });

  it('parses every token in the cardiologia fascia di età catalog', () => {
    const catalogTokens = [
      '> 17 anni', '>3 anni', '0 1 anno', 'da 12 a 15 anni', 'da 12 anni a 15 anni',
      'da 15 anni', 'da 5 settimane di vita fino a 1 anno 51 settimane',
      'da 5 settimane fino a 1 anno di vita', 'da 6 anni a 15 anni', 'da 6 anni a 16 anni',
      'da 7 anni a 15 anni', 'dai 13 anni', 'dai 15 anni', 'dai 16 anni', 'dai 3 ai 5 anni',
      'dai 3 anni', 'dai 40 anni', 'dai 45 anni', 'dai 5 anni', 'dai 6 ai 14 anni',
      'dalle 5 settimane di vita fino a 1 anno', 'ecg da 0 fino a 1 anno',
      'ecg da over 1 anno under 16 anni', 'entro le prime 4 settimane di vita', 'neonatale',
      'over 1 anno under 16 anni', 'over 1 anno under 17 anni', 'over 17 anni',
    ];
    for (const token of catalogTokens) {
      expect(parseAgeConstraintToken(token), token).not.toBeNull();
    }
  });
});

describe('formatVincoloBoundsLabel', () => {
  it('shows week bounds for parseable tokens', () => {
    expect(formatVincoloBoundsLabel('over 1 anno under 17 anni'))
      .toBe('min 104 sett. · max 883 sett.');
  });

  it('returns null when token is not parseable', () => {
    expect(formatVincoloBoundsLabel('prima visita')).toBeNull();
  });
});

describe('formatAgeConstraintKbValue', () => {
  it('appends età_min, età_max and week bounds when parseable', () => {
    expect(formatAgeConstraintKbValue('da 6 anni a 15 anni'))
      .toBe('da 6 anni a 15 anni | età_min: 6 | età_max: 15 | età_min_sett: 312 | età_max_sett: 831');
    expect(formatAgeConstraintKbValue('dai 16 anni'))
      .toBe('dai 16 anni | età_min: 16 | età_max: null | età_min_sett: 832 | età_max_sett: null');
    expect(formatAgeConstraintKbValue('entro le prime 4 settimane di vita'))
      .toBe('entro le prime 4 settimane di vita | età_min: 0 | età_max: 0 | età_min_sett: 0 | età_max_sett: 4');
  });
});
