/**
 * Tab order and display labels for dictionary editors in the Dizionari workspace.
 */
import type { KbDictionary } from './dictionaryLibrary';

export const PROJECT_DICTIONARY_TAB_LABEL = 'Project';

/** Project dictionaries show as "Project"; library dictionaries use their name. */
export function dictionaryTabDisplayName(dictionary: KbDictionary): string {
  if (dictionary.scope === 'project') return PROJECT_DICTIONARY_TAB_LABEL;
  return dictionary.name;
}

function scopeRank(scope: KbDictionary['scope']): number {
  return scope === 'project' ? 0 : 1;
}

/** Project ids first, then library ids alphabetically by name. */
export function compareDictionaryTabOrder(a: KbDictionary, b: KbDictionary): number {
  const scopeDiff = scopeRank(a.scope) - scopeRank(b.scope);
  if (scopeDiff !== 0) return scopeDiff;
  return a.name.localeCompare(b.name, 'it', { sensitivity: 'base' });
}

/** Returns dictionary ids in tab order, optionally filtered to a subset. */
export function orderDictionaryIds(
  dictionaries: KbDictionary[],
  ids?: Iterable<string>,
): string[] {
  const idSet = ids ? new Set(ids) : null;
  const pool = idSet ? dictionaries.filter((d) => idSet.has(d.id)) : dictionaries;
  return [...pool].sort(compareDictionaryTabOrder).map((d) => d.id);
}

/** First project dictionary id, or first loaded id if none. */
export function defaultDictionaryEditorId(dictionaries: KbDictionary[]): string | null {
  const ordered = orderDictionaryIds(dictionaries);
  return ordered[0] ?? null;
}
