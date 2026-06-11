/**
 * Dropdown form to promote the Project dictionary to library.
 * Uses the same fields as «Nuovo» but scope is locked to Libreria.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { FolderKanban, Library, Loader2 } from 'lucide-react';
import { DICTIONARY_INDUSTRIES } from '../../lib/dictionaryIndustries';
import {
  DICT_FORM_FIELD,
  DICT_FORM_LABEL,
  DICT_FORM_ROW,
  DICT_FORM_ROW_TOP,
  DICT_FORM_UI_TEXT,
  DICT_UI_BTN,
} from './dictionaryFormStyles';

export interface SaveProjectToLibraryInput {
  name: string;
  industry: string;
  industryCustom?: string | null;
  description?: string | null;
}

export interface SaveProjectToLibraryPanelProps {
  suggestedName: string;
  defaultIndustry: string;
  defaultIndustryCustom?: string | null;
  defaultDescription?: string | null;
  tokenCount: number;
  busy?: boolean;
  error?: string | null;
  onConfirm: (input: SaveProjectToLibraryInput) => Promise<boolean>;
  /** Dropdown alignment when rendered inside a dock tab header. */
  menuAlign?: 'left' | 'right';
}

function ScopeRadio({
  scope,
  current,
  onSelect,
  icon: Icon,
  label,
  iconColor,
  disabled = false,
}: {
  scope: 'project' | 'library';
  current: 'project' | 'library';
  onSelect: () => void;
  icon: typeof FolderKanban;
  label: string;
  iconColor: string;
  disabled?: boolean;
}) {
  const selected = current === scope;
  return (
    <label
      className={`flex items-center gap-1 px-1.5 py-1 rounded whitespace-nowrap transition-colors ${
        disabled
          ? 'opacity-40 cursor-not-allowed'
          : selected
            ? 'bg-amber-400/10 text-amber-100 cursor-pointer'
            : 'text-emerald-300 hover:text-emerald-200 cursor-pointer'
      }`}
    >
      <input
        type="radio"
        name="dict-scope-promote"
        checked={selected}
        disabled={disabled}
        onChange={disabled ? undefined : onSelect}
        className="w-3 h-3 flex-shrink-0 accent-amber-400"
      />
      <Icon className="w-3 h-3 flex-shrink-0" strokeWidth={2.25} style={{ color: iconColor }} />
      <span className={DICT_FORM_UI_TEXT}>{label}</span>
    </label>
  );
}

export function SaveProjectToLibraryPanel({
  suggestedName,
  defaultIndustry,
  defaultIndustryCustom = null,
  defaultDescription = null,
  tokenCount,
  busy = false,
  error = null,
  onConfirm,
  menuAlign = 'left',
}: SaveProjectToLibraryPanelProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(suggestedName);
  const [industry, setIndustry] = useState(defaultIndustry);
  const [industryCustom, setIndustryCustom] = useState(defaultIndustryCustom ?? '');
  const [description, setDescription] = useState(defaultDescription ?? '');
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(suggestedName);
    setIndustry(defaultIndustry);
    setIndustryCustom(defaultIndustryCustom ?? '');
    setDescription(defaultDescription ?? '');
  }, [open, suggestedName, defaultIndustry, defaultIndustryCustom, defaultDescription]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const canSubmit = useMemo(() => {
    const trimmed = name.trim();
    if (!trimmed || trimmed.toLowerCase() === 'project') return false;
    if (industry === 'other' && !industryCustom.trim()) return false;
    return true;
  }, [name, industry, industryCustom]);

  const btnClass = DICT_UI_BTN;

  return (
    <div ref={panelRef} className="relative flex-shrink-0">
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        className={`${btnClass} border-sky-400/50 text-sky-100 hover:bg-sky-400/15 disabled:opacity-40`}
        title="Salva il dizionario Project in libreria e apri un nuovo Project vuoto"
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Library className="w-3 h-3" />}
        Salva in libreria
      </button>

      {open && (
        <div
          className={`absolute top-full mt-1 z-[10050] w-[22rem] rounded border border-[#1a3a2a] bg-[#0a1510] shadow-xl p-3 space-y-2.5 ${
            menuAlign === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <p className={`${DICT_FORM_UI_TEXT} text-emerald-300/80 leading-relaxed`}>
            Project ({tokenCount} token) diventerà un dizionario di libreria.
            Si aprirà un nuovo tab Project vuoto.
          </p>

          <div className={DICT_FORM_ROW}>
            <span className={DICT_FORM_LABEL}>Nome</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome dizionario *"
              className={DICT_FORM_FIELD}
              autoFocus
            />
          </div>

          <div className={DICT_FORM_ROW}>
            <span className={DICT_FORM_LABEL}>Industry</span>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
              <select
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className={`${DICT_FORM_FIELD} w-auto min-w-[7.5rem] max-w-[9rem] flex-shrink-0`}
              >
                {DICTIONARY_INDUSTRIES.map((i) => (
                  <option key={i.id} value={i.id}>{i.label}</option>
                ))}
              </select>
              <ScopeRadio
                scope="project"
                current="library"
                onSelect={() => {}}
                icon={FolderKanban}
                label="Progetto"
                iconColor="#34d399"
                disabled
              />
              <ScopeRadio
                scope="library"
                current="library"
                onSelect={() => {}}
                icon={Library}
                label="Libreria"
                iconColor="#38bdf8"
              />
            </div>
          </div>

          {industry === 'other' && (
            <div className={DICT_FORM_ROW}>
              <span className={DICT_FORM_LABEL}>Altro</span>
              <input
                type="text"
                value={industryCustom}
                onChange={(e) => setIndustryCustom(e.target.value)}
                placeholder="Industry custom *"
                className={DICT_FORM_FIELD}
              />
            </div>
          )}

          <div className={DICT_FORM_ROW_TOP}>
            <span className={`${DICT_FORM_LABEL} pt-1.5`}>Descrizione</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Opzionale"
              rows={2}
              className={`${DICT_FORM_FIELD} resize-y min-h-[3rem]`}
            />
          </div>

          {name.trim().toLowerCase() === 'project' && (
            <p className={`${DICT_FORM_UI_TEXT} text-amber-300/90`}>
              Il nome non può essere «Project».
            </p>
          )}

          {error && (
            <p className={`${DICT_FORM_UI_TEXT} text-red-400`}>{error}</p>
          )}

          <div className="flex items-center gap-1 justify-end pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => setOpen(false)}
              className={`px-2 py-1 ${DICT_FORM_UI_TEXT} text-emerald-400 hover:text-emerald-200 disabled:opacity-40`}
            >
              Annulla
            </button>
            <button
              type="button"
              disabled={busy || !canSubmit}
              onClick={() => void (async () => {
                const ok = await onConfirm({
                  name: name.trim(),
                  industry,
                  industryCustom: industry === 'other' ? industryCustom.trim() : null,
                  description: description.trim() || null,
                });
                if (ok) setOpen(false);
              })()}
              className={`px-3 py-1 ${DICT_FORM_UI_TEXT} rounded border border-sky-400/50 text-sky-100 hover:bg-sky-400/15 disabled:opacity-40`}
            >
              {busy ? 'Salvataggio…' : 'Salva in libreria'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
