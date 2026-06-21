/**
 * Static canonical test scripts from catalog item segments + age constraints.
 */
import type { BundleCorpusItem, CompiledAgeConstraint } from '../agentBundleTypes';
import { pathSatisfiesAgeConstraints } from '../constraintValidation';
import { normalizeCategoryOrders, type TokenCategory } from '../dictionaryTree';
import { normalizeSlotCategoryKey } from '../slotExtract';
import { buildNaturalOpeningUtterance } from './dialogTestPlanScripts';
import type { DialogTestFamily, DialogTestScript } from './dialogTestPlanTypes';

const NONE_TOKEN = 'none';

function isUsableSegmentText(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.toLowerCase() === NONE_TOKEN) return false;
  return true;
}

function segmentToUserText(text: string): string {
  return text.trim().split('+').join(' ');
}

function categoryOrderIndex(
  categoryName: string,
  categories: readonly TokenCategory[],
): number {
  const key = normalizeSlotCategoryKey(categoryName);
  const ordered = normalizeCategoryOrders([...categories]);
  const idx = ordered.findIndex((c) => normalizeSlotCategoryKey(c.name) === key);
  return idx >= 0 ? idx : 999;
}

/** Picks an age that satisfies all compiled age_years constraints on the item. */
export function pickValidAgeYears(constraints: readonly CompiledAgeConstraint[]): number | null {
  const rules = constraints.filter((c) => c.kind === 'age_years');
  if (rules.length === 0) return null;

  let min = 0;
  let max = 120;
  for (const rule of rules) {
    if (rule.min != null) min = Math.max(min, rule.min);
    if (rule.max != null) max = Math.min(max, rule.max);
  }
  if (min > max) return null;

  const candidates = min === max
    ? [min]
    : [min, Math.floor((min + max) / 2), max].filter((a, i, arr) => arr.indexOf(a) === i);

  for (const age of candidates) {
    if (pathSatisfiesAgeConstraints(age, [...rules])) return age;
  }
  return min;
}

/**
 * Ordered attributo segment texts for a catalog item (category.order, no none/empty).
 */
export function buildCanonicalSegmentTexts(
  item: BundleCorpusItem,
  categories: readonly TokenCategory[],
): string[] {
  const texts = item.segments
    .filter((s) => s.categoryType === 'attributo' && isUsableSegmentText(s.text))
    .sort((a, b) => {
      const oa = categoryOrderIndex(a.categoryName, categories);
      const ob = categoryOrderIndex(b.categoryName, categories);
      if (oa !== ob) return oa - ob;
      return a.text.localeCompare(b.text, 'it');
    })
    .map((s) => segmentToUserText(s.text));

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const t of texts) {
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(t);
  }

  const age = pickValidAgeYears(item.constraints);
  if (age != null) {
    unique.push(`${age} anni`);
  }

  return unique;
}

/** Merges catalog segment tokens missing from guided steps with engine-order guided steps. */
export function mergeOpeningTokensWithGuidedSteps(
  guidedSteps: readonly string[],
  segmentTokens: readonly string[],
): string[] {
  if (guidedSteps.length === 0) return [...segmentTokens];
  const guidedLower = new Set(guidedSteps.map((s) => s.toLowerCase()));
  const opening = segmentTokens.filter((t) => !guidedLower.has(t.toLowerCase()));
  return [...opening, ...guidedSteps];
}

function buildFamilySteps(
  opening: string,
  tokens: readonly string[],
  family: DialogTestFamily,
): string[] {
  /** Minimi: solo token catalogo, uno per turno — niente frase naturale. */
  if (family === 'minimal') {
    return [...tokens];
  }

  if (family === 'complete') {
    const all = opening ? [opening, ...tokens] : [...tokens];
    return all.length > 0 ? [all.join(' ')] : [];
  }

  if (tokens.length === 0) {
    return opening ? [opening] : [];
  }

  const splitAt = Math.max(1, Math.ceil(tokens.length * 0.75));
  const head = tokens.slice(0, splitAt).join(' ');
  const tail = tokens.slice(splitAt);

  if (!opening) {
    return tail.length > 0 ? [head, ...tail] : [head];
  }
  return tail.length > 0
    ? [`${opening} ${head}`.trim(), ...tail]
    : [`${opening} ${head}`.trim()];
}

/** Builds Minimi (token only) / 3-4 / One-shot (natural opening + tokens). */
export function buildCanonicalDialogScripts(
  sourceText: string,
  canonicalTokens: readonly string[],
): Record<DialogTestFamily, DialogTestScript> {
  const opening = buildNaturalOpeningUtterance(sourceText);

  return {
    minimal: { family: 'minimal', userSteps: buildFamilySteps(opening, canonicalTokens, 'minimal') },
    intermediate: {
      family: 'intermediate',
      userSteps: buildFamilySteps(opening, canonicalTokens, 'intermediate'),
    },
    complete: { family: 'complete', userSteps: buildFamilySteps(opening, canonicalTokens, 'complete') },
  };
}
