/**
 * Catalog Navigator landing: hero, project table, and Omnia-style tabs.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2, ChevronDown, FolderOpen, Loader2, Trash2,
} from 'lucide-react';
import { DeleteConfirmPopover } from './DeleteConfirmPopover';
import type { ProjectCatalogRow } from '../types/project';
import {
  formatProjectDate,
  projectIndustryDisplay,
  projectVersionDisplay,
} from '../services/projectService';

type LandingTab = 'all' | 'recent' | 'draft';

type PendingDelete =
  | { type: 'one'; id: string; name: string }
  | { type: 'all' };

interface LandingPageProps {
  projects: ProjectCatalogRow[];
  loading: boolean;
  loadError?: string | null;
  onNewProject: () => void;
  onSelectProject: (id: string) => void | Promise<void>;
  onDeleteProject: (id: string) => void | Promise<void>;
  onDeleteAllProjects: () => void | Promise<void>;
}

function cell(value: string | null | undefined): string {
  const v = value?.trim();
  return v ? v : '—';
}

export function LandingPage({
  projects,
  loading,
  loadError = null,
  onNewProject,
  onSelectProject,
  onDeleteProject,
  onDeleteAllProjects,
}: LandingPageProps) {
  const [tab, setTab] = useState<LandingTab>('recent');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  const hasProjects = projects.length > 0;

  const filtered = useMemo(() => {
    if (tab === 'draft') return projects.filter((p) => p.status === 'draft');
    if (tab === 'recent') return [...projects].sort(
      (a, b) => b.updatedAt.localeCompare(a.updatedAt),
    ).slice(0, 20);
    return projects;
  }, [projects, tab]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPendingDelete(null);
    };
    if (pendingDelete) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pendingDelete]);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    if (pendingDelete.type === 'all') {
      setDeletingAll(true);
      try {
        await onDeleteAllProjects();
        setPendingDelete(null);
      } finally {
        setDeletingAll(false);
      }
      return;
    }
    setDeletingId(pendingDelete.id);
    try {
      await onDeleteProject(pendingDelete.id);
      setPendingDelete(null);
    } finally {
      setDeletingId(null);
    }
  }, [pendingDelete, onDeleteProject, onDeleteAllProjects]);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto bg-black text-emerald-300">
      <div className="flex flex-col items-center px-6 pt-16 pb-10">
        <h1 className="font-mono text-5xl md:text-6xl font-bold tracking-[0.2em] text-[#e8d48b] mb-3">
          CATALOG NAVIGATOR
        </h1>
        <p className="font-mono text-sm text-emerald-400/80 mb-8">
          The platform for the customer care.
        </p>

        <div className="flex items-center gap-8 font-mono text-sm">
          <button
            type="button"
            onClick={onNewProject}
            className="text-[#e8d48b] hover:text-[#fff3c4] transition-colors underline-offset-4 hover:underline"
          >
            Nuovo Progetto
          </button>
          {hasProjects && (
            <button
              type="button"
              onClick={() => document.getElementById('projects-panel')?.scrollIntoView({ behavior: 'smooth' })}
              className="flex items-center gap-1 text-[#e8d48b] hover:text-[#fff3c4] transition-colors"
            >
              Progetti esistenti
              <ChevronDown className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {hasProjects && (
        <div id="projects-panel" className="flex-1 px-4 pb-10 max-w-6xl mx-auto w-full">
          <div className="border border-emerald-500/40 rounded-sm bg-[#050a06]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-emerald-500/30">
              <div className="flex gap-1">
                {([
                  ['all', 'Tutti'],
                  ['recent', 'Recenti'],
                  ['draft', 'Da recuperare'],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={`px-4 py-1.5 font-mono text-xs transition-colors ${
                      tab === id
                        ? 'bg-emerald-500 text-black font-semibold'
                        : 'text-emerald-400 hover:text-emerald-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPendingDelete({ type: 'all' })}
                  disabled={deletingAll || loading}
                  className="px-3 py-1 font-mono text-xs text-red-400 border border-red-400/50 rounded hover:bg-red-400/10 disabled:opacity-40"
                >
                  {deletingAll ? 'Eliminazione…' : 'Elimina tutti'}
                </button>
                {pendingDelete?.type === 'all' && (
                  <DeleteConfirmPopover
                    message="Eliminare TUTTI i progetti e i documenti? Operazione irreversibile."
                    onConfirm={() => void confirmDelete()}
                    onCancel={() => setPendingDelete(null)}
                    confirming={deletingAll}
                    align="right"
                  />
                )}
              </div>
            </div>

            {loadError && (
              <p className="px-4 py-2 font-mono text-xs text-red-400 border-b border-emerald-500/20">
                {loadError}
              </p>
            )}

            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-emerald-400/40">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="font-mono text-sm">Caricamento progetti…</span>
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-12 text-center font-mono text-sm text-emerald-400/30">
                Nessun progetto in questa vista.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full font-mono text-xs border-collapse">
                  <thead>
                    <tr className="text-emerald-400 border-b border-emerald-500/30">
                      {['Cliente', 'Progetto', 'Industry', 'Data', 'Owner (Azienda)', 'Owner (Cliente)', ''].map((h) => (
                        <th key={h || 'actions'} className="text-left px-4 py-2 font-semibold whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-emerald-500/15 hover:bg-emerald-400/5 cursor-pointer group"
                        onClick={() => void onSelectProject(row.id)}
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-2 text-emerald-300/90">
                            <Building2 className="w-3.5 h-3.5 text-emerald-500/60" />
                            {cell(row.client)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-2 text-[#e8d48b]">
                            <FolderOpen className="w-3.5 h-3.5 text-emerald-500/60 flex-shrink-0" />
                            <span className="truncate max-w-[200px]">{row.name}</span>
                            <span className="text-violet-400/80 text-[10px] flex-shrink-0">
                              {projectVersionDisplay(row)}
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-3 text-emerald-400/70 whitespace-nowrap">
                          {projectIndustryDisplay(row)}
                        </td>
                        <td className="px-4 py-3 text-emerald-400/70 whitespace-nowrap">
                          {formatProjectDate(row.updatedAt)}
                        </td>
                        <td className="px-4 py-3 text-emerald-400/70 whitespace-nowrap">
                          {cell(row.ownerCompany)}
                        </td>
                        <td className="px-4 py-3 text-emerald-400/70 whitespace-nowrap">
                          {cell(row.ownerClient)}
                        </td>
                        <td className="px-4 py-3 relative">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPendingDelete({ type: 'one', id: row.id, name: row.name });
                            }}
                            disabled={deletingId === row.id}
                            className="opacity-0 group-hover:opacity-100 p-1.5 rounded text-red-400/50 hover:text-red-400 hover:bg-red-400/10 transition-all"
                            title="Elimina progetto"
                          >
                            {deletingId === row.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                          {pendingDelete?.type === 'one' && pendingDelete.id === row.id && (
                            <DeleteConfirmPopover
                              message={(
                                <>
                                  Eliminare il progetto &quot;{row.name}&quot; e i relativi documenti?
                                </>
                              )}
                              onConfirm={() => void confirmDelete()}
                              onCancel={() => setPendingDelete(null)}
                              confirming={deletingId === row.id}
                              align="right"
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
