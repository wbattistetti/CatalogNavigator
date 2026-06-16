/**
 * Tests for constraint validation helpers.
 */
import { describe, expect, it } from 'vitest';
import {
  extractAgeYearsFromText,
  pathSatisfiesAgeConstraints,
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
      { kind: 'age_years', categoryName: 'fascia di età', askKey: 'age_years', min: 6, max: 15, sourceToken: 'da 6 anni a 15 anni' },
    ];
    expect(pathSatisfiesAgeConstraints(10, rules)).toBe(true);
    expect(pathSatisfiesAgeConstraints(16, rules)).toBe(false);
  });
});
