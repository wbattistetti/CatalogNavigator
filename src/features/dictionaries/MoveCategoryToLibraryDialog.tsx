/**
 * Dialog to move a whole project category into a new or existing library dictionary.
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Library, Loader2, X } from 'lucide-react';
import type { KbDictionary } from '../../lib/dictionaryLibrary';
import { DictionaryIcon } from '../../components/DocumentViewer/DictionaryIcon';

import { DICT_FORM_FIELD, DICT_UI_TEXT } from './dictionaryFormStyles';

export interface MoveCategoryToLibraryDialogProps {
  categoryName: string;
  tokenCount: number;
  libraryDictionaries: KbDictionary[];
  busy?: boolean;
  error?: string | null;
  onConfirm: (target: { mode: 'new'; name: string } | { mode: 'existing'; dictionaryId: string }) => void;
  onClose: () => void;
}

export function MoveCategoryToLibraryDialog({
  categoryName,
  tokenCount,
  libraryDictionaries,
  busy = false,
  error = null,
  onConfirm,
  onClose,
}: MoveCategoryToLibraryDialogProps) {
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [newName, setNewName] = useState(categoryName);
  const [existingId, setExistingId] = useState('');

  const sortedLibrary = useMemo(
    () => [...libraryDictionaries].sort((a, b) => a.name.localeCompare(b.name, 'it')),
    [libraryDictionaries],
  );

  useEffect(() => {
    setNewName(categoryName);
  }, [categoryName]);

  useEffect(() => {
    if (sortedLibrary.length > 0 && !existingId) {
      setExistingId(sortedLibrary[0]!.id);
    }
  }, [sortedLibrary, existingId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const canSubmit = mode === 'new'
    ? newName.trim().length > 0
    : existingId.length > 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center p-4 bg-black/60"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded border border-[#1a3a2a] bg-[#0a1510] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[#1a3a2a]">
          <div className="flex items-center gap-2 min-w-0">
            <Library className="w-4 h-4 text-sky-300 flex-shrink-0" />
            <h2 className="font-mono text-xs text-emerald-100 truncate">
              Sposta in libreria
            </h2>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="p-1 rounded text-emerald-400/60 hover:text-emerald-200 disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-3 space-y-3">
          <p className={`${DICT_UI_TEXT} text-emerald-300/85 leading-relaxed`}>
            La categoria <span className="text-amber-200">{categoryName}</span> ({tokenCount} token)
            verrà rimossa dal dizionario di progetto e spostata in libreria.
          </p>

          <label className={`flex items-center gap-2 cursor-pointer ${DICT_UI_TEXT} text-emerald-200`}>
            <input
              type="radio"
              name="move-cat-mode"
              checked={mode === 'new'}
              onChange={() => setMode('new')}
              className="accent-sky-400"
            />
            Nuovo dizionario libreria
          </label>
          {mode === 'new' && (
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nome dizionario libreria"
              className={DICT_FORM_FIELD}
            />
          )}

          <label className={`flex items-center gap-2 cursor-pointer ${DICT_UI_TEXT} text-emerald-200 ${
            sortedLibrary.length === 0 ? 'opacity-40' : ''
          }`}>
            <input
              type="radio"
              name="move-cat-mode"
              checked={mode === 'existing'}
              disabled={sortedLibrary.length === 0}
              onChange={() => setMode('existing')}
              className="accent-sky-400"
            />
            Dizionario libreria esistente
          </label>
          {mode === 'existing' && sortedLibrary.length > 0 && (
            <select
              value={existingId}
              onChange={(e) => setExistingId(e.target.value)}
              className={DICT_FORM_FIELD}
            >
              {sortedLibrary.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          )}
          {mode === 'existing' && sortedLibrary.length === 0 && (
            <p className={`${DICT_UI_TEXT} text-emerald-400/55 pl-5`}>
              Nessun dizionario libreria nel sistema. Crea prima un dizionario libreria o usa «Nuovo».
            </p>
          )}

          {sortedLibrary.length > 0 && mode === 'existing' && existingId && (
            <div className="flex items-center gap-2 pl-5">
              {(() => {
                const d = sortedLibrary.find((x) => x.id === existingId);
                if (!d) return null;
                return (
                  <>
                    <DictionaryIcon iconKey={d.icon_key} iconColor={d.icon_color} size="xs" />
                    <span className={`${DICT_UI_TEXT} text-emerald-300/70`}>
                      Merge nella categoria omonima se presente
                    </span>
                  </>
                );
              })()}
            </div>
          )}

          {error && (
            <p className={`${DICT_UI_TEXT} text-red-400`}>{error}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[#1a3a2a]">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className={`px-3 py-1.5 ${DICT_UI_TEXT} text-emerald-400 hover:text-emerald-200 disabled:opacity-40`}
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={busy || !canSubmit}
            onClick={() => {
              if (mode === 'new') {
                onConfirm({ mode: 'new', name: newName.trim() });
              } else {
                onConfirm({ mode: 'existing', dictionaryId: existingId });
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 ${DICT_UI_TEXT} rounded border border-sky-400/50 text-sky-100 hover:bg-sky-400/15 disabled:opacity-40`}
          >
            {busy && <Loader2 className="w-3 h-3 animate-spin" />}
            Sposta in libreria
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
