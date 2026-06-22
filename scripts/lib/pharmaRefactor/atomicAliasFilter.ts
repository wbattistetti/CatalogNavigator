/**
 * Filters dictionary aliases for atomic pharma dimensions (container, dose, quantity, form).
 */
import type { PharmaCategoryName } from '../pharmaDictionaryCategories';
import { isFormaFarmaceuticaSpellingAlias } from './decompose';
import { normalizeKey } from './normalize';

/** Categories whose aliases must be spelling variants only — never decomposed catalog lines. */
export const ATOMIC_SPELLING_ALIAS_CATEGORIES: readonly PharmaCategoryName[] = [
  'Forma farmaceutica',
  'Tipo contenitore',
  'Materiale contenitore',
  'Quantità confezione',
  'Dosaggio / concentrazione',
] as const;

/**
 * Returns true when phrase may be persisted as aliasOf canonical for this category.
 * Non-atomic categories (e.g. Nome commerciale) keep all aliases.
 */
export function isSpellingOnlyAlias(
  phrase: string,
  canonical: string,
  category: PharmaCategoryName,
): boolean {
  if (!(ATOMIC_SPELLING_ALIAS_CATEGORIES as readonly string[]).includes(category)) {
    return true;
  }
  if (category === 'Forma farmaceutica') {
    return isFormaFarmaceuticaSpellingAlias(phrase, canonical);
  }
  const phraseWords = normalizeKey(phrase).split(/\s+/).filter(Boolean);
  const canonWords = normalizeKey(canonical).split(/\s+/).filter(Boolean);
  if (phraseWords.length !== canonWords.length) return false;
  return normalizeKey(phrase) === normalizeKey(canonical);
}
