/**
 * Nuovo / Carica (e scollega) — una sola barra nel workspace Dizionari, sopra il dock editor.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, FolderKanban, FolderTree, Library, Loader2, Plus, Unlink } from 'lucide-react';
import { CATEGORIZE_WAIT_LABEL, useCategorizeTokens } from './useCategorizeTokens';
import type { UseProjectDictionariesResult } from '../../hooks/useProjectDictionaries';
import type { KbDictionary } from '../../lib/dictionaryLibrary';
import { DICTIONARY_INDUSTRIES, industryLabel } from '../../lib/dictionaryIndustries';
import { DictionaryIcon } from '../../components/DocumentViewer/DictionaryIcon';
import { useDocumentEditorController } from '../document-editor/DocumentEditorContext';
import {
  DICT_FORM_FIELD,
  DICT_FORM_LABEL,
  DICT_FORM_ROW,
  DICT_FORM_ROW_TOP,
  DICT_UI_BTN,
  DICT_UI_TEXT,
} from './dictionaryFormStyles';

function groupByIndustry(dictionaries: KbDictionary[]) {
  const map = new Map<string, KbDictionary[]>();
  for (const d of dictionaries) {
    const key = d.industry === 'other' && d.industry_custom?.trim()
      ? `other:${d.industry_custom.trim()}`
      : d.industry;
    const list = map.get(key) ?? [];
    list.push(d);
    map.set(key, list);
  }
  const order = new Map(DICTIONARY_INDUSTRIES.map((i, idx) => [i.id, idx]));
  return [...map.entries()]
    .map(([industryKey, items]) => ({
      industryKey,
      label: industryLabel(items[0]!.industry, items[0]!.industry_custom),
      items: items.sort((a, b) => a.name.localeCompare(b.name, 'it')),
    }))
    .sort((a, b) => {
      const ao = order.get(a.items[0]!.industry) ?? 99;
      const bo = order.get(b.items[0]!.industry) ?? 99;
      if (ao !== bo) return ao - bo;
      return a.label.localeCompare(b.label, 'it');
    });
}

function ScopeRadio({
  scope,
  current,
  onSelect,
  icon: Icon,
  label,
  iconColor,
}: {
  scope: 'project' | 'library';
  current: 'project' | 'library';
  onSelect: () => void;
  icon: typeof FolderKanban;
  label: string;
  iconColor: string;
}) {
  const selected = current === scope;
  return (
    <label
      className={`flex items-center gap-1 px-1.5 py-1 rounded cursor-pointer whitespace-nowrap transition-colors ${
        selected ? 'bg-amber-400/10 text-amber-100' : 'text-emerald-300 hover:text-emerald-200'
      }`}
    >
      <input
        type="radio"
        name="dict-scope-inline"
        checked={selected}
        onChange={onSelect}
        className="w-3 h-3 flex-shrink-0 accent-amber-400"
      />
      <Icon className="w-3 h-3 flex-shrink-0" strokeWidth={2.25} style={{ color: iconColor }} />
      <span className={DICT_UI_TEXT}>{label}</span>
    </label>
  );
}

interface DictionaryLibraryActionsProps {
  dicts?: UseProjectDictionariesResult;
  compact?: boolean;
}

export function DictionaryLibraryActions({ dicts: dictsProp, compact = false }: DictionaryLibraryActionsProps) {
  const ctx = useDocumentEditorController();
  const dicts = dictsProp ?? ctx.dicts;
  const categorize = useCategorizeTokens();

  const [creating, setCreating] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIndustry, setNewIndustry] = useState('healthcare');
  const [newIndustryCustom, setNewIndustryCustom] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newScope, setNewScope] = useState<'library' | 'project'>('project');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const createRef = useRef<HTMLDivElement>(null);
  const libraryRef = useRef<HTMLDivElement>(null);

  const linkedLoaded = useMemo(
    () => dicts.linkedLibrary.map((l) => l.dictionary),
    [dicts.linkedLibrary],
  );

  const loadedIds = useMemo(() => {
    const ids = new Set<string>();
    if (dicts.projectDictionaryId) ids.add(dicts.projectDictionaryId);
    for (const d of linkedLoaded) ids.add(d.id);
    return ids;
  }, [dicts.projectDictionaryId, linkedLoaded]);

  const libraryInSystem = useMemo(
    () => dicts.available.filter((d) => d.scope === 'library'),
    [dicts.available],
  );

  const libraryLoadable = useMemo(
    () => libraryInSystem.filter((d) => !loadedIds.has(d.id)),
    [libraryInSystem, loadedIds],
  );

  const hasProjectDictionary = dicts.projectDictionaryId != null;

  useEffect(() => {
    if (hasProjectDictionary && newScope === 'project') {
      setNewScope('library');
    }
  }, [hasProjectDictionary, newScope]);

  useEffect(() => {
    if (!creating) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!createRef.current?.contains(e.target as Node)) setCreating(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [creating]);

  useEffect(() => {
    if (!libraryOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!libraryRef.current?.contains(e.target as Node)) setLibraryOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [libraryOpen]);

  const handleLoadLibrary = useCallback(async (dictionaryId: string) => {
    setBusy(true);
    setLocalError(null);
    try {
      await dicts.loadLibraryDictionary(dictionaryId);
      setLibraryOpen(false);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Caricamento fallito');
    } finally {
      setBusy(false);
    }
  }, [dicts]);

  const handleUnloadLibrary = useCallback(async (dictionaryId: string) => {
    setBusy(true);
    setLocalError(null);
    try {
      await ctx.handleUnloadLibraryDictionary(dictionaryId);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Scollegamento fallito');
    } finally {
      setBusy(false);
    }
  }, [ctx]);

  const handleCreate = async () => {
    setBusy(true);
    setLocalError(null);
    try {
      await dicts.createNewDictionary({
        name: newName,
        industry: newIndustry,
        industryCustom: newIndustry === 'other' ? newIndustryCustom : null,
        description: newDescription || null,
        scope: newScope,
      });
      setCreating(false);
      setNewName('');
      setNewDescription('');
      setNewIndustryCustom('');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Creazione fallita');
    } finally {
      setBusy(false);
    }
  };

  if (dicts.loading) {
    return (
      <div className={`flex items-center gap-1.5 px-1 ${DICT_UI_TEXT} text-emerald-400/50`}>
        <Loader2 className="w-3 h-3 animate-spin" />
        …
      </div>
    );
  }

  const loadGroups = groupByIndustry(libraryLoadable);
  const btnClass = DICT_UI_BTN;

  return (
    <div className="flex items-center gap-1.5 flex-shrink-0 h-full">
      <div ref={createRef} className="relative">
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className={`${btnClass} border-amber-400/50 text-amber-200 hover:bg-amber-400/15`}
        >
          <Plus className="w-3 h-3" />
          Nuovo
        </button>
        {creating && (
          <div className="absolute left-0 top-full mt-1 z-[100] w-[22rem] rounded border border-[#1a3a2a] bg-[#0a1510] shadow-xl p-3 space-y-2.5">
            <div className={DICT_FORM_ROW}>
              <span className={DICT_FORM_LABEL}>Nome</span>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nome dizionario *"
                className={DICT_FORM_FIELD}
              />
            </div>
            <div className={DICT_FORM_ROW}>
              <span className={DICT_FORM_LABEL}>Industry</span>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                <select
                  value={newIndustry}
                  onChange={(e) => setNewIndustry(e.target.value)}
                  className={`${DICT_FORM_FIELD} w-auto min-w-[7.5rem] max-w-[9rem] flex-shrink-0`}
                >
                  {DICTIONARY_INDUSTRIES.map((i) => (
                    <option key={i.id} value={i.id}>{i.label}</option>
                  ))}
                </select>
                {!hasProjectDictionary && (
                  <ScopeRadio
                    scope="project"
                    current={newScope}
                    onSelect={() => setNewScope('project')}
                    icon={FolderKanban}
                    label="Progetto"
                    iconColor="#34d399"
                  />
                )}
                <ScopeRadio
                  scope="library"
                  current={newScope}
                  onSelect={() => setNewScope('library')}
                  icon={Library}
                  label="Libreria"
                  iconColor="#38bdf8"
                />
              </div>
            </div>
            {newIndustry === 'other' && (
              <div className={DICT_FORM_ROW}>
                <span className={DICT_FORM_LABEL}>Altro</span>
                <input
                  type="text"
                  value={newIndustryCustom}
                  onChange={(e) => setNewIndustryCustom(e.target.value)}
                  placeholder="Industry custom *"
                  className={DICT_FORM_FIELD}
                />
              </div>
            )}
            <div className={DICT_FORM_ROW_TOP}>
              <span className={`${DICT_FORM_LABEL} pt-1.5`}>Descrizione</span>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Opzionale"
                rows={2}
                className={`${DICT_FORM_FIELD} resize-y min-h-[3rem]`}
              />
            </div>
            <div className="flex items-center gap-1 justify-end pt-1">
              <button
                type="button"
                onClick={() => setCreating(false)}
                className={`px-2 py-1 ${DICT_UI_TEXT} text-emerald-400 hover:text-emerald-200`}
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={busy || !newName.trim() || (newIndustry === 'other' && !newIndustryCustom.trim())}
                onClick={() => void handleCreate()}
                className={`px-3 py-1 ${DICT_UI_TEXT} rounded border border-amber-400/50 text-amber-200 hover:bg-amber-400/15 disabled:opacity-40`}
              >
                Crea
              </button>
            </div>
          </div>
        )}
      </div>

      <div ref={libraryRef} className="relative">
        <button
          type="button"
          disabled={busy}
          onClick={() => setLibraryOpen((v) => !v)}
          title="Collega un dizionario dalla libreria al progetto"
          className={`${btnClass} border-sky-400/50 text-sky-200 hover:bg-sky-400/15 disabled:opacity-40 ${
            compact ? 'max-w-[9rem]' : ''
          }`}
        >
          <Library className="w-3 h-3 flex-shrink-0" />
          <span className={compact ? 'truncate' : 'whitespace-nowrap'}>
            {compact ? 'Da libreria' : 'Carica dizionario da libreria'}
          </span>
          <ChevronDown className={`w-3 h-3 flex-shrink-0 transition-transform ${libraryOpen ? 'rotate-180' : ''}`} />
        </button>
        {libraryOpen && (
          <div className="absolute left-0 top-full mt-1 z-[100] min-w-[16rem] max-w-[22rem] max-h-72 overflow-y-auto rounded border border-[#1a3a2a] bg-[#0a1510] shadow-xl py-1">
            {linkedLoaded.length > 0 && (
              <>
                <div className={`${DICT_UI_TEXT} px-3 py-1.5 text-emerald-400/60 uppercase tracking-wide`}>
                  Nel progetto (tokenizzazione)
                </div>
                {linkedLoaded.map((d) => (
                  <div
                    key={d.id}
                    className={`flex items-center gap-0.5 pl-1 pr-1 ${DICT_UI_TEXT}`}
                  >
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        dicts.openDictionaryEditor(d.id);
                        setLibraryOpen(false);
                      }}
                      className="flex-1 min-w-0 flex items-center gap-2 pl-2 pr-2 py-1.5 text-emerald-200/90 hover:bg-sky-400/10 text-left disabled:opacity-40"
                      title="Apri tab dizionario"
                    >
                      <DictionaryIcon iconKey={d.icon_key} iconColor={d.icon_color} size="xs" />
                      <span className="truncate flex-1">{d.name}</span>
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleUnloadLibrary(d.id)}
                      className="flex-shrink-0 p-1.5 rounded text-red-400/60 hover:bg-red-400/10 hover:text-red-400 disabled:opacity-40"
                      title="Scollega dal progetto"
                    >
                      <Unlink className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {(loadGroups.length > 0) && (
                  <div className="border-t border-[#1a3a2a] my-1" />
                )}
              </>
            )}
            {loadGroups.length > 0 ? (
              loadGroups.map((group) => (
                <div key={group.industryKey}>
                  <div className={`${DICT_UI_TEXT} px-3 py-1.5 text-emerald-400 font-semibold uppercase tracking-wide`}>
                    {group.label}
                  </div>
                  {group.items.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      disabled={busy}
                      onClick={() => void handleLoadLibrary(d.id)}
                      className={`w-full flex items-center gap-2 pl-6 pr-3 py-1.5 ${DICT_UI_TEXT} text-emerald-200 hover:bg-sky-400/10 text-left disabled:opacity-40`}
                    >
                      <DictionaryIcon iconKey={d.icon_key} iconColor={d.icon_color} size="sm" />
                      <span className="truncate">{d.name}</span>
                    </button>
                  ))}
                </div>
              ))
            ) : linkedLoaded.length === 0 ? (
              <div className={`${DICT_UI_TEXT} px-3 py-2 text-emerald-300/80`}>
                Nessun dizionario libreria disponibile
              </div>
            ) : null}
          </div>
        )}
      </div>

      <button
        type="button"
        disabled={busy || categorize.generating || !categorize.canCategorize}
        onClick={() => void categorize.startCategorize()}
        title={
          categorize.generating
            ? CATEGORIZE_WAIT_LABEL
            : categorize.canCategorize
              ? 'Assegna con IA i token in no category; puoi correggere dopo manualmente'
              : 'Serve almeno una categoria, descrizioni e token senza categoria'
        }
        className={`${btnClass} border-emerald-400/50 text-emerald-100 hover:bg-emerald-400/15 disabled:opacity-40 ${
          categorize.generating ? 'bg-emerald-400/10' : ''
        }`}
      >
        {categorize.generating ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
            <span>{CATEGORIZE_WAIT_LABEL}</span>
          </>
        ) : (
          <>
            <FolderTree className="w-3 h-3 flex-shrink-0" />
            Categorizza
          </>
        )}
      </button>

      {(localError || categorize.error || dicts.error) && (
        <span
          className={`${DICT_UI_TEXT} text-red-400 truncate max-w-[14rem]`}
          title={localError ?? categorize.error ?? dicts.error ?? ''}
        >
          {localError ?? categorize.error ?? dicts.error}
        </span>
      )}
    </div>
  );
}
