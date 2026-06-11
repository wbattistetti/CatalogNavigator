/**
 * Subscribes to a single dictionary edit session without re-rendering on other dictionaries' edits.
 */
import { useSyncExternalStore } from 'react';
import type { DictionaryEditSession } from '../lib/dictionaryEditSession';
import {
  getDictionarySession,
  subscribeDictionarySession,
} from '../lib/dictionarySessionStore';

export function useDictionarySession(dictionaryId: string): DictionaryEditSession | null {
  return useSyncExternalStore(
    (onStoreChange) => subscribeDictionarySession(dictionaryId, onStoreChange),
    () => getDictionarySession(dictionaryId),
    () => getDictionarySession(dictionaryId),
  );
}
