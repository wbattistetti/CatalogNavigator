/**
 * Manages per-dictionary edit buffers and open editor tabs (no network I/O).
 */
import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import type { KbDictionary } from '../lib/dictionaryLibrary';
import type { TokenCategory } from '../lib/dictionaryTree';
import {
  applyDictionaryEditSessionPatch,
  createDictionaryEditSession,
  type DictionaryEditSession,
} from '../lib/dictionaryEditSession';
import type { TokenEntry } from '../lib/tokenDictionary';
import { orderDictionaryIds } from '../lib/dictionaryTabOrder';
import { replaceDictionarySessions } from '../lib/dictionarySessionStore';

export interface UseDictionaryEditSessionsResult {
  openEditorIds: string[];
  activeDictionaryId: string | null;
  editingDictionary: KbDictionary | null;
  dirty: boolean;
  canSave: boolean;
  anyEditorDirty: boolean;
  getSession: (dictionaryId: string) => DictionaryEditSession | null;
  getDictionaryMeta: (dictionaryId: string) => KbDictionary | null;
  syncSessionsFromLoaded: (dictionaries: KbDictionary[], preserveDirty: boolean) => void;
  syncOpenEditorsAfterReload: (
    validIds: Set<string>,
    defaultDictionaryId: string | null,
    dictionaries?: KbDictionary[],
  ) => void;
  openDictionaryEditor: (dictionaryId: string) => void;
  closeDictionaryEditor: (dictionaryId: string, options?: { force?: boolean }) => boolean;
  isEditorOpen: (dictionaryId: string) => boolean;
  focusDictionaryEditor: (dictionaryId: string) => void;
  setEditingDictionaryId: (id: string) => void;
  markSessionSaved: (saved: KbDictionary) => void;
  discardDictionary: (dictionaryId: string) => void;
  discardEditingDictionary: () => void;
  setEditingTokens: (tokens: TokenEntry[]) => void;
  setEditingCategories: (categories: TokenCategory[]) => void;
  setSessionTokens: (dictionaryId: string, tokens: TokenEntry[]) => void;
  setSessionCategories: (dictionaryId: string, categories: TokenCategory[]) => void;
}

export function useDictionaryEditSessions(
  allLoadedDictionaries: KbDictionary[],
): UseDictionaryEditSessionsResult {
  const [sessions, setSessions] = useState<Map<string, DictionaryEditSession>>(new Map());
  const [openEditorIds, setOpenEditorIds] = useState<string[]>([]);
  const [activeDictionaryId, setActiveDictionaryId] = useState<string | null>(null);

  const getDictionaryMeta = useCallback(
    (dictionaryId: string) => allLoadedDictionaries.find((d) => d.id === dictionaryId) ?? null,
    [allLoadedDictionaries],
  );

  const getSession = useCallback(
    (dictionaryId: string) => sessions.get(dictionaryId) ?? null,
    [sessions],
  );

  const activeSession = activeDictionaryId ? sessions.get(activeDictionaryId) ?? null : null;

  const editingDictionary = useMemo(() => {
    if (!activeDictionaryId || !activeSession) return null;
    const meta = getDictionaryMeta(activeDictionaryId);
    if (!meta) return null;
    return { ...meta, tokens: activeSession.tokens, categories: activeSession.categories };
  }, [activeDictionaryId, activeSession, getDictionaryMeta]);

  const dirty = activeSession?.dirty ?? false;

  const anyEditorDirty = useMemo(
    () => [...sessions.values()].some((s) => s.dirty),
    [sessions],
  );

  /** Pushes session state to the external store after commit (never during setState). */
  useLayoutEffect(() => {
    replaceDictionarySessions(sessions);
  }, [sessions]);

  const upsertSessionFromDictionary = useCallback((dict: KbDictionary, preserveIfDirty: boolean) => {
    setSessions((prev) => {
      const existing = prev.get(dict.id);
      if (existing?.dirty && preserveIfDirty) return prev;
      const next = new Map(prev);
      next.set(dict.id, createDictionaryEditSession(dict));
      return next;
    });
  }, []);

  const syncSessionsFromLoaded = useCallback((dictionaries: KbDictionary[], preserveDirty: boolean) => {
    setSessions((prev) => {
      const next = new Map<string, DictionaryEditSession>();
      for (const dict of dictionaries) {
        const existing = prev.get(dict.id);
        if (existing?.dirty && preserveDirty) {
          next.set(dict.id, existing);
        } else {
          next.set(dict.id, createDictionaryEditSession(dict));
        }
      }
      return next;
    });
  }, []);

  const syncOpenEditorsAfterReload = useCallback((
    validIds: Set<string>,
    defaultDictionaryId: string | null,
    dictionaries?: KbDictionary[],
  ) => {
    const pool = dictionaries ?? allLoadedDictionaries;

    setOpenEditorIds((prev) => {
      const pruned = orderDictionaryIds(pool, prev.filter((id) => validIds.has(id)));
      if (pruned.length > 0) return pruned;
      if (defaultDictionaryId && validIds.has(defaultDictionaryId)) return [defaultDictionaryId];
      const first = orderDictionaryIds(pool, validIds)[0];
      return first ? [first] : [];
    });

    setActiveDictionaryId((prev) => {
      if (prev && validIds.has(prev)) return prev;
      if (defaultDictionaryId && validIds.has(defaultDictionaryId)) return defaultDictionaryId;
      const first = orderDictionaryIds(pool, validIds)[0];
      return first ?? null;
    });
  }, [allLoadedDictionaries]);

  const openDictionaryEditor = useCallback((dictionaryId: string) => {
    const meta = getDictionaryMeta(dictionaryId);
    if (!meta) return;
    upsertSessionFromDictionary(meta, true);
    setOpenEditorIds((prev) => {
      const next = prev.includes(dictionaryId) ? prev : [...prev, dictionaryId];
      return orderDictionaryIds(allLoadedDictionaries, next);
    });
    setActiveDictionaryId(dictionaryId);
  }, [getDictionaryMeta, upsertSessionFromDictionary, allLoadedDictionaries]);

  const closeDictionaryEditor = useCallback((
    dictionaryId: string,
    options?: { force?: boolean },
  ): boolean => {
    const session = sessions.get(dictionaryId);
    if (session?.dirty && !options?.force) {
      if (!window.confirm('Modifiche non salvate. Chiudere l\'editor?')) return false;
    }
    setOpenEditorIds((prev) => prev.filter((id) => id !== dictionaryId));
    setActiveDictionaryId((prev) => {
      if (prev !== dictionaryId) return prev;
      const remaining = openEditorIds.filter((id) => id !== dictionaryId);
      return orderDictionaryIds(allLoadedDictionaries, remaining)[0]
        ?? allLoadedDictionaries[0]?.id
        ?? null;
    });
    if (session && !session.dirty) {
      const meta = getDictionaryMeta(dictionaryId);
      if (meta) upsertSessionFromDictionary(meta, false);
    }
    return true;
  }, [sessions, openEditorIds, allLoadedDictionaries, getDictionaryMeta, upsertSessionFromDictionary]);

  const isEditorOpen = useCallback(
    (dictionaryId: string) => openEditorIds.includes(dictionaryId),
    [openEditorIds],
  );

  const focusDictionaryEditor = useCallback((dictionaryId: string) => {
    if (!getDictionaryMeta(dictionaryId)) return;
    setActiveDictionaryId((prev) => (prev === dictionaryId ? prev : dictionaryId));
  }, [getDictionaryMeta]);

  const setEditingDictionaryId = useCallback((id: string) => {
    if (openEditorIds.includes(id)) {
      focusDictionaryEditor(id);
      return;
    }
    openDictionaryEditor(id);
  }, [openEditorIds, focusDictionaryEditor, openDictionaryEditor]);

  const markSessionSaved = useCallback((saved: KbDictionary) => {
    setSessions((prev) => {
      const next = new Map(prev);
      next.set(saved.id, createDictionaryEditSession(saved));
      return next;
    });
  }, []);

  const discardDictionary = useCallback((dictionaryId: string) => {
    const meta = getDictionaryMeta(dictionaryId);
    if (!meta) return;
    upsertSessionFromDictionary(meta, false);
  }, [getDictionaryMeta, upsertSessionFromDictionary]);

  const discardEditingDictionary = useCallback(() => {
    if (!activeDictionaryId) return;
    discardDictionary(activeDictionaryId);
  }, [activeDictionaryId, discardDictionary]);

  const patchSession = useCallback((
    dictionaryId: string,
    patch: Partial<Pick<DictionaryEditSession, 'tokens' | 'categories'>>,
  ) => {
    setSessions((prev) => {
      const current = prev.get(dictionaryId);
      if (!current) return prev;
      const updated = applyDictionaryEditSessionPatch(current, patch);
      const next = new Map(prev);
      next.set(dictionaryId, updated);
      return next;
    });
  }, []);

  const setEditingTokens = useCallback((tokens: TokenEntry[]) => {
    if (!activeDictionaryId) return;
    patchSession(activeDictionaryId, { tokens });
  }, [activeDictionaryId, patchSession]);

  const setEditingCategories = useCallback((categories: TokenCategory[]) => {
    if (!activeDictionaryId) return;
    patchSession(activeDictionaryId, { categories });
  }, [activeDictionaryId, patchSession]);

  const setSessionTokens = useCallback((dictionaryId: string, tokens: TokenEntry[]) => {
    patchSession(dictionaryId, { tokens });
  }, [patchSession]);

  const setSessionCategories = useCallback((dictionaryId: string, categories: TokenCategory[]) => {
    patchSession(dictionaryId, { categories });
  }, [patchSession]);

  return {
    openEditorIds,
    activeDictionaryId,
    editingDictionary,
    dirty,
    canSave: dirty && !!activeDictionaryId,
    anyEditorDirty,
    getSession,
    getDictionaryMeta,
    syncSessionsFromLoaded,
    syncOpenEditorsAfterReload,
    openDictionaryEditor,
    closeDictionaryEditor,
    isEditorOpen,
    focusDictionaryEditor,
    setEditingDictionaryId,
    markSessionSaved,
    discardDictionary,
    discardEditingDictionary,
    setEditingTokens,
    setEditingCategories,
    setSessionTokens,
    setSessionCategories,
  };
}
