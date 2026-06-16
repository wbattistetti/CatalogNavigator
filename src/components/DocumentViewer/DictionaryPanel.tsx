/**
 * Tokenization workflow: corpus editor (dictionary tree is in the Dizionari tab).
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Loader2, AlertCircle, Check, Library, X } from 'lucide-react';
import type { KbDocument } from '../../lib/supabase';
import type { ParsedTabular } from '../../lib/parseTabular';
import type { TokenCategory } from '../../lib/dictionaryTree';
import { syncCategoriesWithTokens } from '../../lib/dictionaryTree';
import {
  getActiveTokens,
  type TokenDictionary,
  type TokenEntry,
} from '../../lib/tokenDictionary';
import {
  mergeAllDictionarySessionsIntoLoadedRefs,
  mergeLoadedTokens,
} from '../../lib/multiDictionarySegment';
import { getPathOrderingCategories } from '../../lib/pathCanonicalize';
import {
  persistDocumentColumnRoles,
  setDescriptionColumnRole,
} from '../../lib/columnRoles';
import type { UseProjectDictionariesResult } from '../../hooks/useProjectDictionaries';
import { DictionaryIcon } from './DictionaryIcon';
import { CorpusTokenEditor } from './CorpusTokenEditor';
import { dictionaryTabDisplayName } from '../../lib/dictionaryTabOrder';
import { DescriptionColumnSelect } from './DescriptionColumnSelect';

export type DictionaryAfterSaveHandler = (
  dictionary: TokenDictionary,
  descriptions: string[],
) => void | Promise<void>;

export interface DictionaryPanelState {
  dirty: boolean;
  canSave: boolean;
  saving?: boolean;
  activeTokenCount: number;
  descriptionColumn: string | null;
  save: () => Promise<void>;
  discard: () => void;
  getDictionary: () => TokenDictionary | null;
  getMergedDictionary: () => TokenDictionary | null;
  getDescriptions: () => string[];
  replaceTokens: (tokens: TokenEntry[]) => void;
  replaceCategories: (categories: TokenCategory[]) => void;
}

interface DictionaryPanelProps {
  doc: KbDocument;
  tabular: ParsedTabular;
  dicts: UseProjectDictionariesResult;
  descriptionColumn: string | null;
  onDocUpdated: (doc: KbDocument) => void;
  onStateChange: (state: DictionaryPanelState) => void;
  onAfterSave?: DictionaryAfterSaveHandler;
  onUnloadLibraryDictionary?: (dictionaryId: string) => void | Promise<void>;
  onOpenDictionary?: (dictionaryId: string) => void;
  syncNotice?: string | null;
  error: string | null;
}

type SaveStatus = 'idle' | 'saved' | 'error';

export const DictionaryPanel = memo(function DictionaryPanel({
  doc,
  tabular,
  dicts,
  descriptionColumn,
  onDocUpdated,
  onStateChange,
  onAfterSave,
  onUnloadLibraryDictionary,
  onOpenDictionary,
  syncNotice = null,
  error,
}: DictionaryPanelProps) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [descriptionFilterStats, setDescriptionFilterStats] = useState({
    visible: 0,
    total: 0,
    active: false,
  });

  const descriptions = useMemo(() => {
    if (!descriptionColumn) return [];
    const idx = tabular.headers.indexOf(descriptionColumn);
    if (idx < 0) return [];
    return tabular.rows.map((r) => r[idx] ?? '');
  }, [tabular, descriptionColumn]);

  const projectDictId = dicts.projectDictionaryId;
  const projectSession = projectDictId ? dicts.getSession(projectDictId) : null;
  const projectMeta = projectDictId ? dicts.getDictionaryMeta(projectDictId) : null;

  const editingTokens = projectSession?.tokens ?? [];
  const editingCategories = projectSession?.categories ?? [];
  const projectDirty = projectSession?.dirty ?? false;

  const activeCount = useMemo(() => {
    if (!projectDictId) {
      return getActiveTokens(mergeLoadedTokens(dicts.loadedRefs)).length;
    }
    const liveRefs = mergeAllDictionarySessionsIntoLoadedRefs(
      dicts.loadedRefs,
      (id) => dicts.getSession(id),
    );
    return getActiveTokens(mergeLoadedTokens(liveRefs)).length;
  }, [
    dicts.loadedRefs,
    dicts.getSession,
    dicts.dictionarySessionsRevision,
    projectDictId,
  ]);
  const rowCount = descriptions.filter((d) => d.trim()).length;

  const loadedDictionaryLabels = useMemo(
    () => dicts.loadedRefs.map((ref) => {
      const isProject = ref.dictionary.id === projectDictId;
      const tokenCount = isProject && projectSession
        ? projectSession.tokens.filter((t) => !t.aliasOf).length
        : ref.dictionary.tokens.filter((t) => !t.aliasOf).length;
      return {
        id: ref.dictionary.id,
        name: dictionaryTabDisplayName(ref.dictionary),
        scope: ref.dictionary.scope,
        tokenCount,
      };
    }),
    [dicts.loadedRefs, projectDictId, projectSession],
  );

  const getEditingDictionary = useCallback((): TokenDictionary | null => {
    if (!descriptionColumn || !projectMeta) return null;
    return {
      descriptionColumn,
      tokens: editingTokens,
      categories: editingCategories,
    };
  }, [descriptionColumn, projectMeta, editingTokens, editingCategories]);

  const getMergedDictionary = useCallback((): TokenDictionary | null => {
    if (!descriptionColumn || dicts.loadedRefs.length === 0) return null;
    const liveRefs = mergeAllDictionarySessionsIntoLoadedRefs(
      dicts.loadedRefs,
      (id) => dicts.getSession(id),
    );
    return {
      descriptionColumn,
      tokens: mergeLoadedTokens(liveRefs),
      categories: getPathOrderingCategories(liveRefs),
    };
  }, [
    descriptionColumn,
    dicts.loadedRefs,
    dicts.getSession,
    dicts.dictionarySessionsRevision,
  ]);

  const handleSetDescriptionColumn = useCallback(async (column: string) => {
    setLocalError(null);
    try {
      const newRoles = setDescriptionColumnRole(doc.column_roles ?? {}, tabular.headers, column);
      const fresh = await persistDocumentColumnRoles(doc.id, newRoles);
      onDocUpdated(fresh);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Impossibile salvare la colonna descrizione');
    }
  }, [doc.column_roles, doc.id, tabular.headers, onDocUpdated]);

  const handleSave = useCallback(async () => {
    if (!descriptionColumn || saving) return;
    setSaving(true);
    setLocalError(null);

    try {
      if (!projectDictId) throw new Error('Nessun dizionario di progetto');
      await dicts.saveDictionary(projectDictId);

      const newRoles = setDescriptionColumnRole(doc.column_roles ?? {}, tabular.headers, descriptionColumn);
      const fresh = await persistDocumentColumnRoles(doc.id, newRoles);
      onDocUpdated(fresh);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus((s) => (s === 'saved' ? 'idle' : s)), 2000);

      const merged = getMergedDictionary();
      if (merged) await onAfterSave?.(merged, descriptions);
    } catch (err) {
      setSaveStatus('error');
      setLocalError(err instanceof Error ? err.message : 'Salvataggio fallito');
    } finally {
      setSaving(false);
    }
  }, [descriptionColumn, saving, dicts, doc, tabular.headers, onDocUpdated, getMergedDictionary, descriptions, onAfterSave, projectDictId]);

  const handleDiscard = useCallback(() => {
    if (projectDictId) dicts.discardDictionary(projectDictId);
    setSaveStatus('idle');
    setLocalError(null);
  }, [dicts, projectDictId]);

  const handleTokensChange = useCallback((next: TokenEntry[]) => {
    if (!projectDictId) return;
    const synced = syncCategoriesWithTokens(editingCategories, next);
    dicts.setSessionTokens(projectDictId, next);
    dicts.setSessionCategories(projectDictId, synced);
  }, [dicts, editingCategories, projectDictId]);

  const handleCategoriesChange = useCallback((next: TokenCategory[]) => {
    if (!projectDictId) return;
    dicts.setSessionCategories(projectDictId, next);
  }, [dicts, projectDictId]);

  const descriptionsRef = useRef(descriptions);
  descriptionsRef.current = descriptions;

  const projectDictIdRef = useRef(projectDictId);
  projectDictIdRef.current = projectDictId;

  const setSessionTokensRef = useRef(dicts.setSessionTokens);
  setSessionTokensRef.current = dicts.setSessionTokens;

  const getDescriptions = useCallback(() => descriptionsRef.current, []);

  const replaceTokens = useCallback((tokens: TokenEntry[]) => {
    const id = projectDictIdRef.current;
    if (!id) return;
    setSessionTokensRef.current(id, tokens);
    const session = dicts.getSession(id);
    const categories = session?.categories ?? [];
    dicts.setSessionCategories(id, syncCategoriesWithTokens(categories, tokens));
  }, [dicts]);

  const replaceCategories = useCallback((categories: TokenCategory[]) => {
    const id = projectDictIdRef.current;
    if (!id) return;
    dicts.setSessionCategories(id, categories);
  }, [dicts]);

  const panelState = useMemo((): DictionaryPanelState => ({
    dirty: projectDirty,
    canSave: projectDirty && !saving && !!projectDictId,
    saving,
    activeTokenCount: activeCount,
    descriptionColumn,
    save: handleSave,
    discard: handleDiscard,
    getDictionary: getEditingDictionary,
    getMergedDictionary,
    getDescriptions,
    replaceTokens,
    replaceCategories,
  }), [
    projectDirty,
    saving,
    projectDictId,
    activeCount,
    descriptionColumn,
    handleSave,
    handleDiscard,
    getEditingDictionary,
    getMergedDictionary,
    getDescriptions,
    replaceTokens,
    replaceCategories,
  ]);

  const panelRevision = useMemo(
    () => [
      projectDirty,
      projectDictId,
      activeCount,
      saving,
      descriptionColumn,
      editingTokens.length,
    ].join('\0'),
    [
      projectDirty,
      projectDictId,
      activeCount,
      saving,
      descriptionColumn,
      editingTokens.length,
    ],
  );

  useEffect(() => {
    onStateChange(panelState);
  }, [panelRevision, panelState, onStateChange]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-shrink-0 px-4 py-2 border-b border-[#1a3a2a] bg-[#070d09]">
        <div className="flex items-center gap-2 flex-wrap">
          <BookOpen className="w-4 h-4 text-amber-400/70" />
          <span className="font-mono text-sm font-semibold text-emerald-300">Ontologia</span>
          {loadedDictionaryLabels.length > 0 ? (
            <span className="flex items-center gap-1.5 flex-wrap text-xs">
              {loadedDictionaryLabels.map((entry) => (
                <span
                  key={entry.id}
                  className={`inline-flex items-center gap-1 rounded border overflow-hidden ${
                    entry.scope === 'library'
                      ? 'border-sky-400/35 bg-sky-400/8 text-sky-200/90'
                      : 'border-emerald-400/35 bg-emerald-400/8 text-emerald-200/90'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onOpenDictionary?.(entry.id)}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 hover:bg-white/5 transition-colors cursor-pointer"
                    title={entry.scope === 'library'
                      ? 'Apri editor dizionario libreria'
                      : 'Apri editor dizionario di progetto'}
                  >
                    {entry.scope === 'library' && (
                      <Library className="w-2.5 h-2.5 flex-shrink-0 opacity-80" aria-hidden />
                    )}
                    <span>{entry.name}</span>
                    <span className="opacity-70 tabular-nums">({entry.tokenCount})</span>
                  </button>
                  {entry.scope === 'library' && onUnloadLibraryDictionary && (
                    <button
                      type="button"
                      onClick={() => void onUnloadLibraryDictionary(entry.id)}
                      className="p-0.5 mr-0.5 rounded text-sky-300/50 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                      title="Scollega dizionario libreria"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                </span>
              ))}
            </span>
          ) : projectMeta ? (
            <span className="flex items-center gap-1 font-mono text-[9px] text-sky-400/60">
              <DictionaryIcon
                iconKey={projectMeta.icon_key}
                iconColor={projectMeta.icon_color}
                size="xs"
              />
              {projectMeta.name}
            </span>
          ) : null}
          {projectDirty && (
            <span className="font-mono text-[10px] text-amber-400/90 px-1.5 py-0.5 rounded border border-amber-400/30 bg-amber-400/10">
              modifiche non salvate
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1 font-mono text-[10px] text-emerald-400">
              <Check className="w-3 h-3" /> salvato
            </span>
          )}
          {descriptionColumn ? (
            <>
              <DescriptionColumnSelect
                headers={tabular.headers}
                columnRoles={doc.column_roles}
                value={descriptionColumn}
                onConfirm={handleSetDescriptionColumn}
                variant="inline"
              />
              <span className="font-mono text-[10px] text-emerald-400/40">
                {descriptionFilterStats.active
                  ? `${descriptionFilterStats.visible} / ${descriptionFilterStats.total} righe`
                  : `${rowCount} righe`}
                {' · '}
                {dicts.loadedRefs.length} diz. · {activeCount} token attivi
              </span>
            </>
          ) : null}
        </div>
      </div>

      {(error || localError || dicts.error) && (
        <div className="flex-shrink-0 flex items-center gap-2 mx-4 mt-2 px-3 py-2 rounded border border-red-400/30 bg-red-400/5 text-red-400 font-mono text-xs">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {error ?? localError ?? dicts.error}
        </div>
      )}

      {syncNotice && (
        <div className="flex-shrink-0 mx-4 mt-2 px-3 py-2 rounded border border-sky-400/30 bg-sky-400/8 text-sky-200/90 font-mono text-xs">
          {syncNotice}
        </div>
      )}

      {dicts.loading ? (
        <div className="flex-1 flex items-center justify-center gap-2 text-emerald-400/30 font-mono text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Caricamento…
        </div>
      ) : !descriptionColumn ? (
        <div className="flex-1 flex items-center justify-center px-8">
          <DescriptionColumnSelect
            headers={tabular.headers}
            columnRoles={doc.column_roles}
            value={null}
            onConfirm={handleSetDescriptionColumn}
          />
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col p-4 overflow-hidden">
          <CorpusTokenEditor
            descriptions={descriptions}
            tokens={editingTokens}
            categories={editingCategories}
            loadedRefs={dicts.loadedRefs}
            editingDictionaryId={projectDictId}
            onTokensChange={handleTokensChange}
            onCategoriesChange={handleCategoriesChange}
            onRowFilterStatsChange={setDescriptionFilterStats}
          />
        </div>
      )}
    </div>
  );
});
