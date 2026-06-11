/**
 * External store for per-dictionary edit sessions — subscribers re-render only when their dictionary changes.
 */
import type { DictionaryEditSession } from './dictionaryEditSession';

type Listener = () => void;

const sessions = new Map<string, DictionaryEditSession>();
const listenersByDictionary = new Map<string, Set<Listener>>();

function listenersFor(dictionaryId: string): Set<Listener> {
  let set = listenersByDictionary.get(dictionaryId);
  if (!set) {
    set = new Set();
    listenersByDictionary.set(dictionaryId, set);
  }
  return set;
}

/** Publishes one dictionary session to subscribers of that id only. */
export function publishDictionarySession(
  dictionaryId: string,
  session: DictionaryEditSession | null,
): void {
  if (session) {
    sessions.set(dictionaryId, session);
  } else {
    sessions.delete(dictionaryId);
  }
  listenersFor(dictionaryId).forEach((listener) => listener());
}

/** Replaces all sessions (e.g. after reload) and notifies affected dictionaries. */
export function replaceDictionarySessions(next: Map<string, DictionaryEditSession>): void {
  const touched = new Set([...sessions.keys(), ...next.keys()]);
  sessions.clear();
  for (const [id, session] of next) {
    sessions.set(id, session);
  }
  for (const id of touched) {
    listenersFor(id).forEach((listener) => listener());
  }
}

export function getDictionarySession(dictionaryId: string): DictionaryEditSession | null {
  return sessions.get(dictionaryId) ?? null;
}

export function subscribeDictionarySession(dictionaryId: string, listener: Listener): () => void {
  const set = listenersFor(dictionaryId);
  set.add(listener);
  return () => {
    set.delete(listener);
  };
}
