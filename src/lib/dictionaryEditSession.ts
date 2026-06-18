/**
 * In-memory edit session for a single dictionary (tokens + categories buffer).
 */
import type { KbDictionary } from './dictionaryLibrary';
import type { TokenCategory } from './dictionaryTree';
import { serializeDictionarySnapshot } from './serializeTokens';
import type { TokenEntry } from './tokenDictionary';

import { LARGE_DICTIONARY_TOKEN_THRESHOLD } from './dictionaryLimits';

export interface DictionaryEditSession {
  dictionaryId: string;
  tokens: TokenEntry[];
  categories: TokenCategory[];
  savedSnapshot: string;
  dirty: boolean;
  /** When true, dirty is set on any edit instead of re-serializing the whole dictionary. */
  compactSnapshot: boolean;
}

function buildCompactSnapshot(dict: Pick<KbDictionary, 'tokens' | 'categories' | 'updated_at'>): string {
  const categorized = dict.categories.reduce((n, cat) => n + cat.tokenTexts.length, 0);
  return `compact:v1:${dict.tokens.length}:${dict.categories.length}:${categorized}:${dict.updated_at}`;
}

function buildSavedSnapshot(dict: KbDictionary): { snapshot: string; compactSnapshot: boolean } {
  if (dict.tokens.length >= LARGE_DICTIONARY_TOKEN_THRESHOLD) {
    return { snapshot: buildCompactSnapshot(dict), compactSnapshot: true };
  }
  return {
    snapshot: serializeDictionarySnapshot(dict.tokens, dict.categories),
    compactSnapshot: false,
  };
}

export function createDictionaryEditSession(dict: KbDictionary): DictionaryEditSession {
  const { snapshot, compactSnapshot } = buildSavedSnapshot(dict);
  return {
    dictionaryId: dict.id,
    tokens: dict.tokens,
    categories: dict.categories,
    savedSnapshot: snapshot,
    dirty: false,
    compactSnapshot,
  };
}

export function isDictionaryEditSessionDirty(session: DictionaryEditSession): boolean {
  if (session.compactSnapshot) {
    return session.dirty;
  }
  return serializeDictionarySnapshot(session.tokens, session.categories) !== session.savedSnapshot;
}

export function applyDictionaryEditSessionPatch(
  session: DictionaryEditSession,
  patch: Partial<Pick<DictionaryEditSession, 'tokens' | 'categories'>>,
): DictionaryEditSession {
  const updated = { ...session, ...patch };
  if (updated.compactSnapshot) {
    return { ...updated, dirty: true };
  }
  return { ...updated, dirty: isDictionaryEditSessionDirty(updated) };
}
