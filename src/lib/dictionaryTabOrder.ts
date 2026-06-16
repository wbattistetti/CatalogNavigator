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

function canonicalTokenCount(dictionary: KbDictionary): number {
  return dictionary.tokens.filter((t) => !t.aliasOf).length;
}

/** Every project + linked library dictionary id (tab order). */
export function loadedDictionaryEditorIds(dictionaries: KbDictionary[]): string[] {
  return orderDictionaryIds(dictionaries, dictionaries.map((d) => d.id));
}

/**
 * Active tab on reload: library dict with tokens when project dict is empty,
 * otherwise the first project dictionary.
 */
export function preferredActiveDictionaryId(dictionaries: KbDictionary[]): string | null {
  if (dictionaries.length === 0) return null;

  const ordered = orderDictionaryIds(dictionaries);
  const projectId = ordered.find(
    (id) => dictionaries.find((d) => d.id === id)?.scope === 'project',
  );
  const projectDict = projectId
    ? dictionaries.find((d) => d.id === projectId)
    : undefined;

  if (projectDict && canonicalTokenCount(projectDict) > 0) {
    return projectId!;
  }

  const libraryWithTokens = ordered
    .map((id) => dictionaries.find((d) => d.id === id))
    .filter((d): d is KbDictionary => d?.scope === 'library' && canonicalTokenCount(d) > 0)
    .sort((a, b) => canonicalTokenCount(b) - canonicalTokenCount(a))[0];

  if (libraryWithTokens) return libraryWithTokens.id;
  return projectId ?? ordered[0] ?? null;
}
