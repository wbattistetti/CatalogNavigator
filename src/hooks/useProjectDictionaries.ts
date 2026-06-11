/**
 * Loads and manages project dictionaries: library links, CRUD, and edit sessions.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { KbDocument } from '../lib/supabase';
import type { KbDictionary } from '../lib/dictionaryLibrary';
import {
  createDictionary,
  ensureDefaultProjectDictionary,
  ensureProjectForDocument,
  linkLibraryDictionary,
  listAvailableDictionaries,
  listLinkedLibraryDictionaries,
  listProjectDictionaries,
  migrateLegacyDocumentDictionary,
  unlinkLibraryDictionary,
  updateDictionary,
} from '../lib/dictionaryLibrary';
import { buildLoadedRefs, type LoadedDictionaryRef } from '../lib/multiDictionarySegment';
import { defaultDictionaryEditorId } from '../lib/dictionaryTabOrder';
import {
  moveCategoryToLibrary,
  promoteProjectDictionaryToLibrary,
  type MoveCategoryTarget,
} from '../lib/dictionaryPromotion';
import { useDictionaryEditSessions } from './useDictionaryEditSessions';

export type { DictionaryEditSession } from '../lib/dictionaryEditSession';

export interface UseProjectDictionariesResult {
  loading: boolean;
  error: string | null;
  projectId: string | null;
  available: KbDictionary[];
  projectDicts: KbDictionary[];
  linkedLibrary: Array<{ dictionary: KbDictionary; sortOrder: number }>;
  loadedRefs: LoadedDictionaryRef[];
  allLoadedDictionaries: KbDictionary[];
  openEditorIds: string[];
  editingDictionary: KbDictionary | null;
  editingDictionaryId: string | null;
  focusDictionaryEditor: ReturnType<typeof useDictionaryEditSessions>['focusDictionaryEditor'];
  setEditingDictionaryId: (id: string) => void;
  dirty: boolean;
  canSave: boolean;
  anyEditorDirty: boolean;
  getSession: ReturnType<typeof useDictionaryEditSessions>['getSession'];
  getDictionaryMeta: ReturnType<typeof useDictionaryEditSessions>['getDictionaryMeta'];
  openDictionaryEditor: (dictionaryId: string) => void;
  closeDictionaryEditor: (dictionaryId: string, options?: { force?: boolean }) => boolean;
  isEditorOpen: (dictionaryId: string) => boolean;
  reload: () => Promise<void>;
  loadLibraryDictionary: (dictionaryId: string) => Promise<void>;
  unloadLibraryDictionary: (dictionaryId: string) => Promise<void>;
  createNewDictionary: (input: {
    name: string;
    industry: string;
    industryCustom?: string | null;
    description?: string | null;
    scope: 'library' | 'project';
  }) => Promise<KbDictionary>;
  promoteDictionaryToLibrary: (
    dictionaryId: string,
    input: {
      name: string;
      industry: string;
      industryCustom?: string | null;
      description?: string | null;
    },
  ) => Promise<{ promoted: KbDictionary; newProject: KbDictionary }>;
  moveCategoryToLibrary: (
    sourceDictionaryId: string,
    categoryId: string,
    target: MoveCategoryTarget,
  ) => Promise<{ source: KbDictionary; target: KbDictionary }>;
  saveEditingDictionary: () => Promise<KbDictionary>;
  saveDictionary: (dictionaryId: string) => Promise<KbDictionary>;
  savingDictionaryId: string | null;
  discardEditingDictionary: () => void;
  discardDictionary: (dictionaryId: string) => void;
  setEditingTokens: ReturnType<typeof useDictionaryEditSessions>['setEditingTokens'];
  setEditingCategories: ReturnType<typeof useDictionaryEditSessions>['setEditingCategories'];
  setSessionTokens: ReturnType<typeof useDictionaryEditSessions>['setSessionTokens'];
  setSessionCategories: ReturnType<typeof useDictionaryEditSessions>['setSessionCategories'];
  updateLocalDoc: (doc: KbDocument) => void;
}

export function useProjectDictionaries(
  doc: KbDocument,
  descriptionColumn: string | null,
  onDocUpdated: (doc: KbDocument) => void,
): UseProjectDictionariesResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [localDoc, setLocalDoc] = useState(doc);
  const [projectId, setProjectId] = useState<string | null>(doc.project_id ?? null);
  const [available, setAvailable] = useState<KbDictionary[]>([]);
  const [projectDicts, setProjectDicts] = useState<KbDictionary[]>([]);
  const [linkedLibrary, setLinkedLibrary] = useState<Array<{ dictionary: KbDictionary; sortOrder: number }>>([]);
  const [savingDictionaryId, setSavingDictionaryId] = useState<string | null>(null);

  const allLoadedDictionaries = useMemo(
    () => [...projectDicts, ...linkedLibrary.map((l) => l.dictionary)],
    [projectDicts, linkedLibrary],
  );

  const editSessions = useDictionaryEditSessions(allLoadedDictionaries);

  const loadedRefs = useMemo(
    () => buildLoadedRefs(projectDicts, linkedLibrary),
    [projectDicts, linkedLibrary],
  );

  useEffect(() => {
    setLocalDoc(doc);
  }, [doc]);

  const reload = useCallback(async () => {
    setError(null);
    const hasLoadedData = projectDicts.length > 0 || linkedLibrary.length > 0;
    if (!hasLoadedData) setLoading(true);
    try {
      const { project, doc: nextDoc } = await ensureProjectForDocument(localDoc);
      setProjectId(project.id);
      if (nextDoc.id !== localDoc.id || nextDoc.project_id !== localDoc.project_id) {
        setLocalDoc(nextDoc);
        onDocUpdated(nextDoc);
      }

      if (descriptionColumn && nextDoc.token_dictionary) {
        await migrateLegacyDocumentDictionary(nextDoc, project.id, descriptionColumn);
      }

      if (descriptionColumn) {
        await ensureDefaultProjectDictionary(project.id, nextDoc.name);
      }

      const [avail, proj, linked] = await Promise.all([
        listAvailableDictionaries(project.id),
        listProjectDictionaries(project.id),
        listLinkedLibraryDictionaries(project.id),
      ]);

      setAvailable(avail);
      setProjectDicts(proj);
      setLinkedLibrary(linked);

      const loaded = [...proj, ...linked.map((l) => l.dictionary)];
      editSessions.syncSessionsFromLoaded(loaded, true);

      const allLoadedIds = new Set(loaded.map((d) => d.id));
      const defaultId = defaultDictionaryEditorId(loaded);
      editSessions.syncOpenEditorsAfterReload(allLoadedIds, defaultId, loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore caricamento dizionari');
    } finally {
      setLoading(false);
    }
  }, [
    localDoc,
    descriptionColumn,
    onDocUpdated,
    projectDicts,
    linkedLibrary,
    editSessions.syncSessionsFromLoaded,
    editSessions.syncOpenEditorsAfterReload,
  ]);

  useEffect(() => {
    void reload();
  }, [localDoc.id, descriptionColumn]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Updates in-memory dictionary lists after save without a full reload. */
  const applySavedDictionaryToState = useCallback((saved: KbDictionary) => {
    setProjectDicts((prev) => {
      const idx = prev.findIndex((d) => d.id === saved.id);
      if (idx < 0) return prev;
      const next = [...prev];
      next[idx] = saved;
      return next;
    });
    setLinkedLibrary((prev) => {
      let changed = false;
      const next = prev.map((entry) => {
        if (entry.dictionary.id !== saved.id) return entry;
        changed = true;
        return { ...entry, dictionary: saved };
      });
      return changed ? next : prev;
    });
    editSessions.markSessionSaved(saved);
  }, [editSessions.markSessionSaved]);

  const saveDictionary = useCallback(async (dictionaryId: string) => {
    const session = editSessions.getSession(dictionaryId);
    if (!session) throw new Error('Nessuna sessione per questo dizionario');
    setSavingDictionaryId(dictionaryId);
    try {
      const saved = await updateDictionary(dictionaryId, {
        tokens: session.tokens,
        categories: session.categories,
      });
      applySavedDictionaryToState(saved);
      return saved;
    } finally {
      setSavingDictionaryId((current) => (current === dictionaryId ? null : current));
    }
  }, [editSessions.getSession, applySavedDictionaryToState]);

  const saveEditingDictionary = useCallback(async () => {
    if (!editSessions.activeDictionaryId) throw new Error('Nessun dizionario in modifica');
    return saveDictionary(editSessions.activeDictionaryId);
  }, [editSessions.activeDictionaryId, saveDictionary]);

  const loadLibraryDictionary = useCallback(async (dictionaryId: string) => {
    if (!projectId) return;
    await linkLibraryDictionary(projectId, dictionaryId);
    await reload();
    editSessions.openDictionaryEditor(dictionaryId);
  }, [projectId, reload, editSessions.openDictionaryEditor]);

  const unloadLibraryDictionary = useCallback(async (dictionaryId: string) => {
    if (!projectId) return;
    editSessions.closeDictionaryEditor(dictionaryId, { force: false });
    await unlinkLibraryDictionary(projectId, dictionaryId);
    await reload();
  }, [projectId, reload, editSessions.closeDictionaryEditor]);

  const createNewDictionary = useCallback(async (input: {
    name: string;
    industry: string;
    industryCustom?: string | null;
    description?: string | null;
    scope: 'library' | 'project';
  }) => {
    if (!projectId) throw new Error('Progetto non pronto');
    const created = await createDictionary({
      ...input,
      projectId: input.scope === 'project' ? projectId : null,
    });
    if (input.scope === 'library') {
      await linkLibraryDictionary(projectId, created.id);
    }
    await reload();
    editSessions.openDictionaryEditor(created.id);
    return created;
  }, [projectId, reload, editSessions.openDictionaryEditor]);

  const promoteDictionaryToLibrary = useCallback(async (
    dictionaryId: string,
    input: {
      name: string;
      industry: string;
      industryCustom?: string | null;
      description?: string | null;
    },
  ) => {
    if (!projectId) throw new Error('Progetto non pronto');
    const session = editSessions.getSession(dictionaryId);
    if (session?.dirty) {
      await saveDictionary(dictionaryId);
    }
    const promoted = await promoteProjectDictionaryToLibrary(dictionaryId, projectId, input);
    const newProject = await createDictionary({
      name: 'Project',
      industry: promoted.industry,
      industryCustom: promoted.industry_custom,
      description: 'Dizionario di progetto',
      scope: 'project',
      projectId,
    });
    await reload();
    editSessions.openDictionaryEditor(promoted.id);
    editSessions.openDictionaryEditor(newProject.id);
    editSessions.focusDictionaryEditor(newProject.id);
    return { promoted, newProject };
  }, [
    projectId,
    editSessions.getSession,
    saveDictionary,
    reload,
    editSessions.openDictionaryEditor,
    editSessions.focusDictionaryEditor,
  ]);

  const moveCategoryToLibraryAction = useCallback(async (
    sourceDictionaryId: string,
    categoryId: string,
    target: MoveCategoryTarget,
  ) => {
    if (!projectId) throw new Error('Progetto non pronto');
    const session = editSessions.getSession(sourceDictionaryId);
    const meta = editSessions.getDictionaryMeta(sourceDictionaryId);
    if (!session || !meta) throw new Error('Dizionario sorgente non disponibile');
    if (meta.scope !== 'project') {
      throw new Error('Solo le categorie dei dizionari di progetto possono essere spostate in libreria');
    }

    const result = await moveCategoryToLibrary({
      sourceDictionaryId,
      categoryId,
      projectId,
      sourceTokens: session.tokens,
      sourceCategories: session.categories,
      sourceIndustry: meta.industry,
      sourceIndustryCustom: meta.industry_custom,
      target,
    });

    await reload();
    editSessions.openDictionaryEditor(result.target.id);
    return result;
  }, [projectId, editSessions, reload, editSessions.openDictionaryEditor]);

  return {
    loading,
    error,
    projectId,
    available,
    projectDicts,
    linkedLibrary,
    loadedRefs,
    allLoadedDictionaries,
    openEditorIds: editSessions.openEditorIds,
    editingDictionary: editSessions.editingDictionary,
    editingDictionaryId: editSessions.activeDictionaryId,
    setEditingDictionaryId: editSessions.setEditingDictionaryId,
    focusDictionaryEditor: editSessions.focusDictionaryEditor,
    dirty: editSessions.dirty,
    canSave: editSessions.canSave,
    anyEditorDirty: editSessions.anyEditorDirty,
    getSession: editSessions.getSession,
    getDictionaryMeta: editSessions.getDictionaryMeta,
    openDictionaryEditor: editSessions.openDictionaryEditor,
    closeDictionaryEditor: editSessions.closeDictionaryEditor,
    isEditorOpen: editSessions.isEditorOpen,
    reload,
    loadLibraryDictionary,
    unloadLibraryDictionary,
    createNewDictionary,
    promoteDictionaryToLibrary,
    moveCategoryToLibrary: moveCategoryToLibraryAction,
    saveEditingDictionary,
    saveDictionary,
    savingDictionaryId,
    discardEditingDictionary: editSessions.discardEditingDictionary,
    discardDictionary: editSessions.discardDictionary,
    setEditingTokens: editSessions.setEditingTokens,
    setEditingCategories: editSessions.setEditingCategories,
    setSessionTokens: editSessions.setSessionTokens,
    setSessionCategories: editSessions.setSessionCategories,
    updateLocalDoc: setLocalDoc,
  };
}
