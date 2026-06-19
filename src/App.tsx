/**
 * Catalog Navigator root: landing page, new-project modal, project workspace.
 */
import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Database } from 'lucide-react';
import { LandingPage } from './components/LandingPage';
import { NewProjectModal } from './components/NewProjectModal';
import { ProjectWorkspace } from './components/ProjectWorkspace';
import { useDocuments } from './hooks/useDocuments';
import type { ProjectCatalogRow, ProjectInfo } from './types/project';
import {
  createProject,
  deleteAllProjects,
  deleteProject,
  fetchAllProjects,
} from './services/projectService';

type AppState = 'landing' | 'creatingProject' | 'mainApp';

export default function App() {
  const { getFileUrl } = useDocuments();
  const [appState, setAppState] = useState<AppState>('landing');
  const [projects, setProjects] = useState<ProjectCatalogRow[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsLoadError, setProjectsLoadError] = useState<string | null>(null);
  const [currentProject, setCurrentProject] = useState<ProjectCatalogRow | null>(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    setProjectsLoading(true);
    setProjectsLoadError(null);
    try {
      const rows = await fetchAllProjects();
      setProjects(rows);
    } catch (err) {
      setProjectsLoadError(err instanceof Error ? err.message : 'Errore caricamento progetti');
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (appState === 'landing' || appState === 'creatingProject') {
      void loadProjects();
    }
  }, [appState, loadProjects]);

  const handleLandingNewProject = useCallback(() => {
    setCreateError(null);
    setAppState('creatingProject');
  }, []);

  const handleCloseNewProjectModal = useCallback(() => {
    setCreateError(null);
    setAppState('landing');
  }, []);

  const handleCreateProject = useCallback(async (info: ProjectInfo): Promise<boolean> => {
    setCreateError(null);
    setIsCreatingProject(true);
    try {
      const created = await createProject(info);
      setCurrentProject(created);
      setAppState('mainApp');
      return true;
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Creazione fallita');
      return false;
    } finally {
      setIsCreatingProject(false);
    }
  }, []);

  const handleSelectProject = useCallback(async (id: string) => {
    const row = projects.find((p) => p.id === id);
    if (!row) {
      await loadProjects();
      const fresh = (await fetchAllProjects()).find((p) => p.id === id);
      if (!fresh) return;
      setCurrentProject(fresh);
    } else {
      setCurrentProject(row);
    }
    setAppState('mainApp');
  }, [projects, loadProjects]);

  const handleDeleteProject = useCallback(async (id: string) => {
    await deleteProject(id);
    if (currentProject?.id === id) {
      setCurrentProject(null);
      setAppState('landing');
    }
    await loadProjects();
  }, [currentProject?.id, loadProjects]);

  const handleDeleteAllProjects = useCallback(async () => {
    await deleteAllProjects();
    setCurrentProject(null);
    setAppState('landing');
    await loadProjects();
  }, [loadProjects]);

  const handleHome = useCallback(() => {
    setCurrentProject(null);
    setAppState('landing');
  }, []);

  const topError = projectsLoadError ?? createError;

  return (
    <div className="flex flex-col h-screen w-full max-w-full overflow-hidden bg-[#0d0d0d] text-emerald-300">
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center gap-3 px-4 py-2 bg-[#050a06] border-b border-[#1a3a2a] h-10 min-w-0">
        <Database className="w-4 h-4 text-emerald-400 flex-shrink-0" />
        <span className="font-mono text-xs font-semibold text-[#e8d48b]/90 tracking-widest uppercase flex-shrink-0">
          Catalog Navigator
        </span>
        {appState === 'mainApp' && currentProject && (
          <>
            <span className="font-mono text-xs text-emerald-400/45 flex-shrink-0">progetto</span>
            <span className="font-mono text-xs text-[#e8d48b]/90 truncate max-w-[240px]">
              {currentProject.name}
            </span>
            <button
              type="button"
              onClick={handleHome}
              className="font-mono text-xs text-[#e8d48b]/75 hover:text-[#e8d48b] transition-colors flex-shrink-0"
            >
              chiudi progetto
            </button>
            <div id="project-left-actions-slot" className="flex items-center gap-2 flex-shrink-0" />
          </>
        )}
        {topError && appState !== 'creatingProject' && (
          <div className="flex items-center gap-1.5 text-red-400 font-mono text-xs min-w-0">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{topError}</span>
          </div>
        )}
        <div id="project-toolbar-slot" className="ml-auto flex items-center gap-2 flex-shrink-0 min-w-0" />
      </div>

      <div className="flex flex-1 min-h-0 min-w-0 w-full max-w-full overflow-hidden mt-10">
        {(appState === 'landing' || appState === 'creatingProject') && (
          <>
            <LandingPage
              projects={projects}
              loading={projectsLoading}
              loadError={projectsLoadError}
              onNewProject={handleLandingNewProject}
              onSelectProject={handleSelectProject}
              onDeleteProject={handleDeleteProject}
              onDeleteAllProjects={handleDeleteAllProjects}
            />
            <NewProjectModal
              isOpen={appState === 'creatingProject'}
              onClose={handleCloseNewProjectModal}
              onCreateProject={handleCreateProject}
              isCreating={isCreatingProject}
              createError={createError}
            />
          </>
        )}

        {appState === 'mainApp' && currentProject && (
          <ProjectWorkspace
            project={currentProject}
            getFileUrl={getFileUrl}
          />
        )}
      </div>
    </div>
  );
}
