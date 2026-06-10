/**
 * Tokenization workflow: corpus editor with dictionary tree on the right.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Loader2, AlertCircle, Check } from 'lucide-react';
import type { KbDocument } from '../../lib/supabase';
import type { ParsedTabular } from '../../lib/parseTabular';
import type { TokenCategory } from '../../lib/dictionaryTree';
import { syncCategoriesWithTokens } from '../../lib/dictionaryTree';
import {
  getActiveTokens,
  type TokenDictionary,
  type TokenEntry,
} from '../../lib/tokenDictionary';
import { mergeLoadedTokens } from '../../lib/multiDictionarySegment';
import {
  persistDocumentColumnRoles,
  setDescriptionColumnRole,
} from '../../lib/columnRoles';
import type { UseProjectDictionariesResult } from '../../hooks/useProjectDictionaries';
import { DictionaryIcon } from './DictionaryIcon';
import { CorpusTokenEditor } from './CorpusTokenEditor';
import { DescriptionColumnSelect } from './DescriptionColumnSelect';

export type DictionaryAfterSaveHandler = (
  dictionary: TokenDictionary,
  descriptions: string[],
) => void | Promise<void>;

export interface DictionaryPanelState {
  dirty: boolean;
  canSave: boolean;
  activeTokenCount: number;
  descriptionColumn: string | null;
  save: () => Promise<void>;
  discard: () => void;
  getDictionary: () => TokenDictionary | null;
  getMergedDictionary: () => TokenDictionary | null;
  getDescriptions: () => string[];
  replaceTokens: (tokens: TokenEntry[]) => void;
}

interface DictionaryPanelProps {
  doc: KbDocument;
  tabular: ParsedTabular;
  dicts: UseProjectDictionariesResult;
  descriptionColumn: string | null;
  onDocUpdated: (doc: KbDocument) => void;
  onStateChange: (state: DictionaryPanelState) => void;
  onAfterSave?: DictionaryAfterSaveHandler;
  syncNotice?: string | null;
  error: string | null;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function DictionaryPanel({
  doc,
  tabular,
  dicts,
  descriptionColumn,
  onDocUpdated,
  onStateChange,
  onAfterSave,
  syncNotice = null,
  error,
}: DictionaryPanelProps) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [localError, setLocalError] = useState<string | null>(null);

  const descriptions = useMemo(() => {
    if (!descriptionColumn) return [];
    const idx = tabular.headers.indexOf(descriptionColumn);
    if (idx < 0) return [];
    return tabular.rows.map((r) => r[idx] ?? '');
  }, [tabular, descriptionColumn]);

  const editingTokens = dicts.editingDictionary?.tokens ?? [];
  const editingCategories = dicts.editingDictionary?.categories ?? [];

  const mergedTokens = useMemo(
    () => mergeLoadedTokens(dicts.loadedRefs),
    [dicts.loadedRefs],
  );

  const activeCount = getActiveTokens(mergedTokens).length;
  const rowCount = descriptions.filter((d) => d.trim()).length;

  const getEditingDictionary = useCallback((): TokenDictionary | null => {
    if (!descriptionColumn || !dicts.editingDictionary) return null;
    return {
      descriptionColumn,
      tokens: editingTokens,
      categories: editingCategories,
    };
  }, [descriptionColumn, dicts.editingDictionary, editingTokens, editingCategories]);

  const getMergedDictionary = useCallback((): TokenDictionary | null => {
    if (!descriptionColumn || dicts.loadedRefs.length === 0) return null;
    const allCategories = dicts.loadedRefs.flatMap((r) => r.dictionary.categories ?? []);
    return {
      descriptionColumn,
      tokens: mergedTokens,
      categories: allCategories,
    };
  }, [descriptionColumn, dicts.loadedRefs, mergedTokens]);

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
    if (!descriptionColumn) return;
    setSaveStatus('saving');
    setLocalError(null);

    try {
      await dicts.saveEditingDictionary();

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
    }
  }, [descriptionColumn, dicts, doc, tabular.headers, onDocUpdated, getMergedDictionary, descriptions, onAfterSave]);

  const handleDiscard = useCallback(() => {
    dicts.discardEditingDictionary();
    setSaveStatus('idle');
    setLocalError(null);
  }, [dicts]);

  const handleTokensChange = useCallback((next: TokenEntry[]) => {
    const synced = syncCategoriesWithTokens(editingCategories, next);
    dicts.setEditingTokens(next);
    dicts.setEditingCategories(synced);
  }, [dicts, editingCategories]);

  const handleCategoriesChange = useCallback((next: TokenCategory[]) => {
    dicts.setEditingCategories(next);
  }, [dicts]);

  useEffect(() => {
    onStateChange({
      dirty: dicts.dirty,
      canSave: dicts.canSave && saveStatus !== 'saving',
      activeTokenCount: activeCount,
      descriptionColumn,
      save: handleSave,
      discard: handleDiscard,
      getDictionary: getEditingDictionary,
      getMergedDictionary,
      getDescriptions: () => descriptions,
      replaceTokens: (tokens) => {
        if (!dicts.editingDictionaryId) return;
        dicts.setEditingTokens(tokens);
      },
    });
  }, [
    dicts.dirty,
    dicts.canSave,
    dicts.editingDictionaryId,
    activeCount,
    descriptionColumn,
    editingTokens,
    editingCategories,
    descriptions,
    onStateChange,
    handleSave,
    handleDiscard,
    getEditingDictionary,
    getMergedDictionary,
    dicts,
    saveStatus,
  ]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-shrink-0 px-4 py-2 border-b border-[#1a3a2a] bg-[#070d09]">
        <div className="flex items-center gap-2 flex-wrap">
          <BookOpen className="w-4 h-4 text-amber-400/70" />
          <span className="font-mono text-sm font-semibold text-emerald-300">Ontologia</span>
          {dicts.editingDictionary && (
            <span className="flex items-center gap-1 font-mono text-[9px] text-sky-400/60">
              <DictionaryIcon
                iconKey={dicts.editingDictionary.icon_key}
                iconColor={dicts.editingDictionary.icon_color}
                size="xs"
              />
              {dicts.editingDictionary.name}
            </span>
          )}
          {dicts.dirty && (
            <span className="font-mono text-[10px] text-amber-400/90 px-1.5 py-0.5 rounded border border-amber-400/30 bg-amber-400/10">
              modifiche non salvate
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1 font-mono text-[10px] text-emerald-400">
              <Check className="w-3 h-3" /> salvato
            </span>
          )}
          {saveStatus === 'saving' && (
            <span className="flex items-center gap-1 font-mono text-[10px] text-emerald-400/60">
              <Loader2 className="w-3 h-3 animate-spin" /> salvataggio…
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
                {rowCount} righe · {dicts.loadedRefs.length} diz. · {activeCount} token attivi
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
            onTokensChange={handleTokensChange}
            onCategoriesChange={handleCategoriesChange}
          />
        </div>
      )}
    </div>
  );
}
