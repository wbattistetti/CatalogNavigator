/**
 * Tests for constraint validation helpers.
 */
import { describe, expect, it } from 'vitest';
import {
  extractAgeYearsFromText,
  pathSatisfiesAgeConstraints,
  pathSatisfiesAgeConstraintsFromTotalMonths,
  satisfiesAgeYears,
} from './constraintValidation';
import type { CompiledAgeConstraint } from './agentBundleTypes';

describe('satisfiesAgeYears', () => {
  it('checks inclusive bounds', () => {
    expect(satisfiesAgeYears(15, 6, 15)).toBe(true);
    expect(satisfiesAgeYears(16, 6, 15)).toBe(false);
    expect(satisfiesAgeYears(18, 18, null)).toBe(true);
    expect(satisfiesAgeYears(17, 18, null)).toBe(false);
  });
});

describe('extractAgeYearsFromText', () => {
  it('parses common Italian age phrases', () => {
    expect(extractAgeYearsFromText('ha 30 anni')).toBe(30);
    expect(extractAgeYearsFromText('è una persona adulta di 30 anni')).toBe(30);
    expect(extractAgeYearsFromText('prima visita')).toBeNull();
  });

  it('parses spoken Italian number words', () => {
    expect(extractAgeYearsFromText('trenta')).toBe(30);
    expect(extractAgeYearsFromText("trent'anni")).toBe(30);
    expect(extractAgeYearsFromText('ha trenta anni')).toBe(30);
  });
});

describe('pathSatisfiesAgeConstraints', () => {
  it('requires all age rules on a path to pass', () => {
    const rules: CompiledAgeConstraint[] = [
      {
        kind: 'age_years',
        categoryName: 'fascia di età',
        askKey: 'age_years',
        min: 6,
        max: 15,
        minMonths: 72,
        maxMonths: 191,
        sourceToken: 'da 6 anni a 15 anni',
      },
    ];
    expect(pathSatisfiesAgeConstraints(10, rules)).toBe(true);
    expect(pathSatisfiesAgeConstraints(16, rules)).toBe(false);
  });
});

describe('pathSatisfiesAgeConstraintsFromTotalMonths', () => {
  it('excludes neonatal week bands for older infants', () => {
    const infantBand: CompiledAgeConstraint = {
      kind: 'age_years',
      categoryName: 'fascia di età',
      askKey: 'age_years',
      min: 0,
      max: 1,
      minMonths: 0,
      maxMonths: 23,
      sourceToken: '0 1 anno',
    };
    const fourWeeks: CompiledAgeConstraint = {
      kind: 'age_years',
      categoryName: 'fascia di età',
      askKey: 'age_years',
      min: 0,
      max: 0,
      minMonths: 0,
      maxMonths: 0,
      sourceToken: 'entro le prime 4 settimane di vita',
    };

    expect(pathSatisfiesAgeConstraintsFromTotalMonths(6, [infantBand])).toBe(true);
    expect(pathSatisfiesAgeConstraintsFromTotalMonths(6, [fourWeeks])).toBe(false);
  });
});
