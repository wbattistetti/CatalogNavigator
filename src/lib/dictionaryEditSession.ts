/**
 * In-memory edit session for a single dictionary (tokens + categories buffer).
 */
import type { KbDictionary } from './dictionaryLibrary';
import type { TokenCategory } from './dictionaryTree';
import { serializeDictionarySnapshot } from './serializeTokens';
import type { TokenEntry } from './tokenDictionary';

export interface DictionaryEditSession {
  dictionaryId: string;
  tokens: TokenEntry[];
  categories: TokenCategory[];
  savedSnapshot: string;
  dirty: boolean;
}

export function createDictionaryEditSession(dict: KbDictionary): DictionaryEditSession {
  return {
    dictionaryId: dict.id,
    tokens: dict.tokens,
    categories: dict.categories,
    savedSnapshot: serializeDictionarySnapshot(dict.tokens, dict.categories),
    dirty: false,
  };
}

export function isDictionaryEditSessionDirty(session: DictionaryEditSession): boolean {
  return serializeDictionarySnapshot(session.tokens, session.categories) !== session.savedSnapshot;
}

export function applyDictionaryEditSessionPatch(
  session: DictionaryEditSession,
  patch: Partial<Pick<DictionaryEditSession, 'tokens' | 'categories'>>,
): DictionaryEditSession {
  const updated = { ...session, ...patch };
  return { ...updated, dirty: isDictionaryEditSessionDirty(updated) };
}
