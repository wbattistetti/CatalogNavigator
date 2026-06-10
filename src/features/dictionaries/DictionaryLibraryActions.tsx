/**
 * Nuovo / Carica (e scollega) — una sola barra nel workspace Dizionari, sopra il dock editor.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, FolderKanban, Library, Loader2, Plus, Unlink } from 'lucide-react';
import type { UseProjectDictionariesResult } from '../../hooks/useProjectDictionaries';
import type { KbDictionary } from '../../lib/dictionaryLibrary';
import { DICTIONARY_INDUSTRIES, industryLabel } from '../../lib/dictionaryIndustries';
import { DictionaryIcon } from '../../components/DocumentViewer/DictionaryIcon';
import { useDocumentEditor } from '../document-editor/DocumentEditorContext';

const UI_TEXT = 'font-mono text-[10px]';
const FIELD =
  'w-full bg-[#080e0a] border border-[#1a3a2a] rounded px-2 py-1.5 font-mono text-xs text-emerald-200 focus:outline-none focus:border-sky-400/50';
const FORM_LABEL = 'font-mono text-xs text-emerald-300';
const FORM_ROW = 'grid grid-cols-[5.5rem_1fr] gap-x-3 items-center';
const FORM_ROW_TOP = 'grid grid-cols-[5.5rem_1fr] gap-x-3 items-start';

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
      <span className={UI_TEXT}>{label}</span>
    </label>
  );
}

interface DictionaryLibraryActionsProps {
  dicts?: UseProjectDictionariesResult;
  compact?: boolean;
}

export function DictionaryLibraryActions({ dicts: dictsProp, compact = false }: DictionaryLibraryActionsProps) {
  const ctx = useDocumentEditor();
  const dicts = dictsProp ?? ctx.dicts;

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
    for (const d of dicts.projectDicts) ids.add(d.id);
    for (const d of linkedLoaded) ids.add(d.id);
    return ids;
  }, [dicts.projectDicts, linkedLoaded]);

  const libraryInSystem = useMemo(
    () => dicts.available.filter((d) => d.scope === 'library'),
    [dicts.available],
  );

  const libraryLoadable = useMemo(
    () => libraryInSystem.filter((d) => !loadedIds.has(d.id)),
    [libraryInSystem, loadedIds],
  );

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
      await dicts.unloadLibraryDictionary(dictionaryId);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Scollegamento fallito');
    } finally {
      setBusy(false);
    }
  }, [dicts]);

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
      <div className={`flex items-center gap-1.5 px-1 ${UI_TEXT} text-emerald-400/50`}>
        <Loader2 className="w-3 h-3 animate-spin" />
        …
      </div>
    );
  }

  const loadGroups = groupByIndustry(libraryLoadable);
  const btnClass = `${UI_TEXT} rounded border px-2 flex items-center gap-1 whitespace-nowrap h-[22px] leading-none`;

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
            <div className={FORM_ROW}>
              <span className={FORM_LABEL}>Nome</span>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nome dizionario *"
                className={FIELD}
              />
            </div>
            <div className={FORM_ROW}>
              <span className={FORM_LABEL}>Industry</span>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                <select
                  value={newIndustry}
                  onChange={(e) => setNewIndustry(e.target.value)}
                  className={`${FIELD} w-auto min-w-[7.5rem] max-w-[9rem] flex-shrink-0`}
                >
                  {DICTIONARY_INDUSTRIES.map((i) => (
                    <option key={i.id} value={i.id}>{i.label}</option>
                  ))}
                </select>
                <ScopeRadio
                  scope="project"
                  current={newScope}
                  onSelect={() => setNewScope('project')}
                  icon={FolderKanban}
                  label="Progetto"
                  iconColor="#34d399"
                />
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
              <div className={FORM_ROW}>
                <span className={FORM_LABEL}>Altro</span>
                <input
                  type="text"
                  value={newIndustryCustom}
                  onChange={(e) => setNewIndustryCustom(e.target.value)}
                  placeholder="Industry custom *"
                  className={FIELD}
                />
              </div>
            )}
            <div className={FORM_ROW_TOP}>
              <span className={`${FORM_LABEL} pt-1.5`}>Descrizione</span>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Opzionale"
                rows={2}
                className={`${FIELD} resize-y min-h-[3rem]`}
              />
            </div>
            <div className="flex items-center gap-1 justify-end pt-1">
              <button
                type="button"
                onClick={() => setCreating(false)}
                className={`px-2 py-1 ${UI_TEXT} text-emerald-400 hover:text-emerald-200`}
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={busy || !newName.trim() || (newIndustry === 'other' && !newIndustryCustom.trim())}
                onClick={() => void handleCreate()}
                className={`px-3 py-1 ${UI_TEXT} rounded border border-amber-400/50 text-amber-200 hover:bg-amber-400/15 disabled:opacity-40`}
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
          className={`${btnClass} border-sky-400/50 text-sky-200 hover:bg-sky-400/15 disabled:opacity-40`}
        >
          Carica
          <ChevronDown className={`w-3 h-3 transition-transform ${libraryOpen ? 'rotate-180' : ''}`} />
        </button>
        {libraryOpen && (
          <div className="absolute left-0 top-full mt-1 z-[100] min-w-[16rem] max-w-[22rem] max-h-72 overflow-y-auto rounded border border-[#1a3a2a] bg-[#0a1510] shadow-xl py-1">
            {linkedLoaded.length > 0 && (
              <>
                <div className={`${UI_TEXT} px-3 py-1.5 text-emerald-400/60 uppercase tracking-wide`}>
                  Nel progetto (tokenizzazione)
                </div>
                {linkedLoaded.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    disabled={busy}
                    onClick={() => void handleUnloadLibrary(d.id)}
                    className={`w-full flex items-center gap-2 pl-3 pr-3 py-1.5 ${UI_TEXT} text-emerald-200/80 hover:bg-red-400/10 text-left disabled:opacity-40`}
                  >
                    <Unlink className="w-3 h-3 text-red-400/70 flex-shrink-0" />
                    <DictionaryIcon iconKey={d.icon_key} iconColor={d.icon_color} size="xs" />
                    <span className="truncate flex-1">{d.name}</span>
                    <span className="text-red-400/60">Scollega</span>
                  </button>
                ))}
                {(loadGroups.length > 0) && (
                  <div className="border-t border-[#1a3a2a] my-1" />
                )}
              </>
            )}
            {loadGroups.length > 0 ? (
              loadGroups.map((group) => (
                <div key={group.industryKey}>
                  <div className={`${UI_TEXT} px-3 py-1.5 text-emerald-400 font-semibold uppercase tracking-wide`}>
                    {group.label}
                  </div>
                  {group.items.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      disabled={busy}
                      onClick={() => void handleLoadLibrary(d.id)}
                      className={`w-full flex items-center gap-2 pl-6 pr-3 py-1.5 ${UI_TEXT} text-emerald-200 hover:bg-sky-400/10 text-left disabled:opacity-40`}
                    >
                      <DictionaryIcon iconKey={d.icon_key} iconColor={d.icon_color} size="sm" />
                      <span className="truncate">{d.name}</span>
                    </button>
                  ))}
                </div>
              ))
            ) : linkedLoaded.length === 0 ? (
              <div className={`${UI_TEXT} px-3 py-2 text-emerald-300/80`}>
                Nessun dizionario libreria disponibile
              </div>
            ) : null}
          </div>
        )}
      </div>

      {(localError || dicts.error) && (
        <span className={`${UI_TEXT} text-red-400 truncate max-w-[8rem]`} title={localError ?? dicts.error ?? ''}>
          Errore
        </span>
      )}
    </div>
  );
}
