/**
 * Runtime validators for compile-time constraints (age vincoli).
 */
import type { CompiledAgeConstraint } from './agentBundleTypes';

/** Inclusive age check against compiled min/max bounds. */
export function satisfiesAgeYears(
  age: number,
  min: number | null,
  max: number | null,
): boolean {
  if (!Number.isFinite(age) || age < 0) return false;
  if (min != null && age < min) return false;
  if (max != null && age > max) return false;
  return true;
}

/** True when every age constraint on the path accepts the given age. */
export function pathSatisfiesAgeConstraints(
  age: number,
  constraints: CompiledAgeConstraint[],
): boolean {
  const ageRules = constraints.filter((c) => c.kind === 'age_years');
  if (ageRules.length === 0) return true;
  return ageRules.every((rule) => satisfiesAgeYears(age, rule.min, rule.max));
}

/** Inclusive age check against compiled week bounds (canonical). */
export function satisfiesAgeTotalWeeks(
  totalWeeks: number,
  minWeeks: number | null,
  maxWeeks: number | null,
  minMonths: number | null,
  maxMonths: number | null,
  min: number | null,
  max: number | null,
): boolean {
  if (!Number.isFinite(totalWeeks) || totalWeeks < 0) return false;
  if (minWeeks != null || maxWeeks != null) {
    if (minWeeks != null && totalWeeks < minWeeks) return false;
    if (maxWeeks != null && totalWeeks > maxWeeks) return false;
    return true;
  }
  if (minMonths != null || maxMonths != null) {
    const totalMonths = Math.floor((totalWeeks * 12) / 52);
    if (minMonths != null && totalMonths < minMonths) return false;
    if (maxMonths != null && totalMonths > maxMonths) return false;
    return true;
  }
  if (min != null && totalWeeks < min * 52) return false;
  if (max != null && totalWeeks > max * 52 + 51) return false;
  return true;
}

/** Inclusive age check against compiled min/max bounds (years or total months). */
export function satisfiesAgeTotalMonths(
  totalMonths: number,
  min: number | null,
  max: number | null,
  minMonths: number | null,
  maxMonths: number | null,
  minWeeks: number | null = null,
  maxWeeks: number | null = null,
): boolean {
  if (!Number.isFinite(totalMonths) || totalMonths < 0) return false;
  if (minWeeks != null || maxWeeks != null) {
    const totalWeeks = Math.floor((totalMonths * 52) / 12);
    return satisfiesAgeTotalWeeks(totalWeeks, minWeeks, maxWeeks, minMonths, maxMonths, min, max);
  }
  if (minMonths != null || maxMonths != null) {
    if (minMonths != null && totalMonths < minMonths) return false;
    if (maxMonths != null && totalMonths > maxMonths) return false;
    return true;
  }
  if (min != null && totalMonths < min * 12) return false;
  if (max != null && totalMonths > max * 12 + 11) return false;
  return true;
}

/** True when every age constraint on the path accepts the given total weeks. */
export function pathSatisfiesAgeConstraintsFromTotalWeeks(
  totalWeeks: number,
  constraints: CompiledAgeConstraint[],
): boolean {
  const ageRules = constraints.filter((c) => c.kind === 'age_years');
  if (ageRules.length === 0) return true;
  return ageRules.every((rule) =>
    satisfiesAgeTotalWeeks(
      totalWeeks,
      rule.minWeeks,
      rule.maxWeeks,
      rule.minMonths,
      rule.maxMonths,
      rule.min,
      rule.max,
    ),
  );
}

/** True when every age constraint on the path accepts the given total months. */
export function pathSatisfiesAgeConstraintsFromTotalMonths(
  totalMonths: number,
  constraints: CompiledAgeConstraint[],
): boolean {
  const ageRules = constraints.filter((c) => c.kind === 'age_years');
  if (ageRules.length === 0) return true;
  return ageRules.every((rule) =>
    satisfiesAgeTotalMonths(
      totalMonths,
      rule.min,
      rule.max,
      rule.minMonths,
      rule.maxMonths,
      rule.minWeeks,
      rule.maxWeeks,
    ),
  );
}

/** Italian cardinal words commonly spoken as patient age (voice input). */
const ITALIAN_AGE_WORDS: Readonly<Record<string, number>> = {
  zero: 0,
  uno: 1, una: 1,
  due: 2,
  tre: 3,
  quattro: 4,
  cinque: 5,
  sei: 6,
  sette: 7,
  otto: 8,
  nove: 9,
  dieci: 10,
  undici: 11,
  dodici: 12,
  tredici: 13,
  quattordici: 14,
  quindici: 15,
  sedici: 16,
  diciassette: 17,
  diciotto: 18,
  diciannove: 19,
  venti: 20,
  trenta: 30,
  trent: 30,
  quaranta: 40,
  cinquanta: 50,
  sessanta: 60,
  settanta: 70,
  ottanta: 80,
  novanta: 90,
  cento: 100,
};

function normalizeItalianAgeWord(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/'/g, '');
}

function parseItalianAgeWord(raw: string): number | null {
  const age = ITALIAN_AGE_WORDS[normalizeItalianAgeWord(raw)];
  return age != null && age >= 0 && age <= 120 ? age : null;
}

/** Extracts first plausible patient age in years from Italian free text. */
export function extractAgeYearsFromText(text: string): number | null {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return null;

  const explicit = normalized.match(
    /(?:ho|ha|sono|è|e|di)\s*(\d{1,3})\s*anni?/,
  );
  if (explicit) {
    const age = Number.parseInt(explicit[1]!, 10);
    return Number.isFinite(age) ? age : null;
  }

  const bare = normalized.match(/\b(\d{1,3})\s*anni?\b/);
  if (bare) {
    const age = Number.parseInt(bare[1]!, 10);
    return Number.isFinite(age) ? age : null;
  }

  const wordWithVerb = normalized.match(
    /(?:ho|ha|sono|è|e|di)\s+([a-zàèéìòù']+)(?:\s+anni|\s*'anni)/,
  );
  if (wordWithVerb) {
    const age = parseItalianAgeWord(wordWithVerb[1]!);
    if (age != null) return age;
  }

  const wordWithAnni = normalized.match(/^([a-zàèéìòù']+)(?:\s+anni|\s*'anni)$/);
  if (wordWithAnni) {
    const age = parseItalianAgeWord(wordWithAnni[1]!);
    if (age != null) return age;
  }

  const standaloneWord = parseItalianAgeWord(normalized);
  if (standaloneWord != null) return standaloneWord;

  return null;
}

/** Standard voice question for age vincoli (never a fascia menu). */
export const AGE_YEARS_QUESTION = 'Quanti anni ha il paziente?';
