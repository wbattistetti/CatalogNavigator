/**
 * New project form modal (Omnia-style) for Catalog Navigator.
 */
import { useCallback, useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { CreatableSelect } from './CreatableSelect';
import { VersionInput } from './VersionInput';
import { DICTIONARY_INDUSTRIES } from '../lib/dictionaryIndustries';
import {
  DEFAULT_PROJECT_INFO,
  PROJECT_LANGUAGES,
  type ProjectInfo,
} from '../types/project';
import {
  fetchCatalogClients,
  fetchCatalogIndustries,
} from '../services/projectService';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProject: (info: ProjectInfo) => Promise<boolean>;
  isCreating?: boolean;
  createError?: string | null;
}

const inputClass =
  'w-full px-3 py-2 rounded bg-[#0a1510] border border-[#c9a84c]/30 text-[#e8d48b] font-mono text-sm placeholder:text-[#c9a84c]/25 focus:outline-none focus:border-[#c9a84c]/60';

export function NewProjectModal({
  isOpen,
  onClose,
  onCreateProject,
  isCreating = false,
  createError = null,
}: NewProjectModalProps) {
  const [form, setForm] = useState<ProjectInfo>(DEFAULT_PROJECT_INFO);
  const [clients, setClients] = useState<string[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setForm(DEFAULT_PROJECT_INFO);
    void Promise.all([fetchCatalogClients(), fetchCatalogIndustries()])
      .then(([c, i]) => {
        setClients(c);
        setIndustries(i);
      })
      .catch(() => { /* catalog optional */ });
  }, [isOpen]);

  const patch = useCallback((partial: Partial<ProjectInfo>) => {
    setForm((prev) => ({ ...prev, ...partial }));
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const ok = await onCreateProject(form);
    if (ok) setForm(DEFAULT_PROJECT_INFO);
  }, [form, onCreateProject]);

  if (!isOpen) return null;

  const industryOptions = [
    ...DICTIONARY_INDUSTRIES.map((i) => i.id),
    ...industries,
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-project-title"
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-lg border border-[#c9a84c]/25 bg-[#121212] shadow-2xl"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#c9a84c]/15">
          <h2 id="new-project-title" className="font-mono text-lg font-bold text-[#e8d48b]">
            Nuovo Progetto
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isCreating}
            className="p-1 text-[#c9a84c]/50 hover:text-[#e8d48b] transition-colors"
            aria-label="Chiudi"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-mono text-xs text-[#c9a84c]/80 mb-1.5">
                Nome Progetto <span className="text-red-400">*</span>
              </label>
              <input
                required
                value={form.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="Inserisci il nome del progetto"
                className={inputClass}
              />
            </div>
            <CreatableSelect
              label="Cliente"
              value={form.client}
              options={clients}
              placeholder="Nome del cliente (es. Indesit)"
              onChange={(client) => patch({ client })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-mono text-xs text-[#c9a84c]/80 mb-1.5">Industry</label>
              <select
                value={form.industry}
                onChange={(e) => patch({ industry: e.target.value })}
                className={inputClass}
              >
                {industryOptions.map((id) => {
                  const preset = DICTIONARY_INDUSTRIES.find((i) => i.id === id);
                  return (
                    <option key={id} value={id}>
                      {preset?.label ?? id}
                    </option>
                  );
                })}
              </select>
            </div>
            <div>
              <label className="block font-mono text-xs text-[#c9a84c]/80 mb-1.5">
                Versione (major.minor)
              </label>
              <VersionInput
                major={form.versionMajor}
                minor={form.versionMinor}
                qualifier={form.versionQualifier}
                onChange={(v) => patch(v)}
              />
            </div>
            <div>
              <label className="block font-mono text-xs text-[#c9a84c]/80 mb-1.5">Lingua</label>
              <select
                value={form.language}
                onChange={(e) => patch({ language: e.target.value as ProjectInfo['language'] })}
                className={inputClass}
              >
                {PROJECT_LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id}>{l.label}</option>
                ))}
              </select>
            </div>
          </div>

          {form.industry === 'other' && (
            <div>
              <label className="block font-mono text-xs text-[#c9a84c]/80 mb-1.5">Industry custom</label>
              <input
                value={form.industryCustom}
                onChange={(e) => patch({ industryCustom: e.target.value })}
                className={inputClass}
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-mono text-xs text-[#c9a84c]/80 mb-1.5">Owner (Azienda)</label>
              <input
                value={form.ownerCompany}
                onChange={(e) => patch({ ownerCompany: e.target.value })}
                placeholder="Owner Sovran"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block font-mono text-xs text-[#c9a84c]/80 mb-1.5">Owner (Cliente)</label>
              <input
                value={form.ownerClient}
                onChange={(e) => patch({ ownerClient: e.target.value })}
                placeholder="Owner cliente"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block font-mono text-xs text-[#c9a84c]/80 mb-1.5">Descrizione</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => patch({ description: e.target.value })}
              placeholder="Descrivi brevemente il progetto"
              className={`${inputClass} resize-y min-h-[80px]`}
            />
          </div>

          {createError && (
            <p className="font-mono text-xs text-red-400">{createError}</p>
          )}

          <div className="flex items-center justify-end gap-4 pt-2 border-t border-[#c9a84c]/15">
            <button
              type="button"
              onClick={onClose}
              disabled={isCreating}
              className="font-mono text-sm text-[#c9a84c]/70 hover:text-[#e8d48b] transition-colors"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={isCreating || !form.name.trim()}
              className="flex items-center gap-2 px-5 py-2 rounded font-mono text-sm text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-40 transition-colors"
            >
              {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
              Crea Progetto
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
