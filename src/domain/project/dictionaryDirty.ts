/**
 * Tracks which loaded dictionary edit sessions have unsaved local changes.
 */
import type { DictionaryEditSession } from '../../lib/dictionaryEditSession';

/** Returns dictionary ids with a dirty in-memory session. */
export function listDirtyDictionaryIds(
  sessions: ReadonlyMap<string, DictionaryEditSession>,
): string[] {
  return [...sessions.entries()]
    .filter(([, session]) => session.dirty)
    .map(([id]) => id)
    .sort((a, b) => a.localeCompare(b));
}

/** True when any loaded dictionary session is dirty. */
export function hasAnyDirtyDictionary(
  sessions: ReadonlyMap<string, DictionaryEditSession>,
): boolean {
  return listDirtyDictionaryIds(sessions).length > 0;
}
