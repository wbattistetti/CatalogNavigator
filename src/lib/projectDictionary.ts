/**
 * Canonical single project dictionary per project — library promotion is separate.
 */
import type { KbDictionary } from './dictionaryLibrary';
import { PROJECT_DICTIONARY_TAB_LABEL } from './dictionaryTabOrder';

/** Returns the one project dictionary the app should use (prefers name «Project»). */
export function canonicalProjectDictionary(
  projectDicts: KbDictionary[],
): KbDictionary | null {
  if (projectDicts.length === 0) return null;
  const namedProject = projectDicts.find(
    (d) => d.scope === 'project' && d.name === PROJECT_DICTIONARY_TAB_LABEL,
  );
  if (namedProject) return namedProject;
  const projectScoped = projectDicts.filter((d) => d.scope === 'project');
  if (projectScoped.length === 0) return null;
  return [...projectScoped].sort(
    (a, b) => a.created_at.localeCompare(b.created_at),
  )[0] ?? null;
}

export function canonicalProjectDictionaryId(
  projectDicts: KbDictionary[],
): string | null {
  return canonicalProjectDictionary(projectDicts)?.id ?? null;
}
