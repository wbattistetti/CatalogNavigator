/**
 * Body for one main editor tab (document, dictionaries, ontology, agent).
 */
import { memo, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { DictionariesWorkspace } from '../dictionaries/DictionariesWorkspace';
import { OntologyWorkspace } from '../ontology/OntologyWorkspace';
import { useDocumentEditorController } from './DocumentEditorContext';
import { DocumentWorkspace } from './DocumentWorkspace';
import { DocumentEditorMessagesPanel } from './DocumentEditorMessagesPanel';
import { CatalogReportWorkspace } from '../ontology/CatalogReportWorkspace';
import { EDITOR_TAB_IDS, type EditorTabId } from './editorTabIds';

const MountedDocumentWorkspace = memo(function MountedDocumentWorkspace() {
  return <DocumentWorkspace />;
});

const MountedDictionariesWorkspace = memo(function MountedDictionariesWorkspace() {
  return <DictionariesWorkspace />;
});

const MountedOntologyWorkspace = memo(function MountedOntologyWorkspace() {
  return <OntologyWorkspace />;
});

const MountedDisambiguationWorkspace = memo(function MountedDisambiguationWorkspace() {
  return <DocumentEditorMessagesPanel />;
});

const MountedCatalogReportWorkspace = memo(function MountedCatalogReportWorkspace() {
  return <CatalogReportWorkspace />;
});

function LoadingPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-full gap-2 text-emerald-400/30 font-mono text-sm">
      <Loader2 className="w-4 h-4 animate-spin" />
      {label}
    </div>
  );
}

function WorkspaceBody({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden">
      {children}
    </div>
  );
}

export const EditorWorkspacePanel = memo(function EditorWorkspacePanel({
  tabId,
  mounted,
}: {
  tabId: EditorTabId;
  mounted: boolean;
}) {
  const { content, dicts } = useDocumentEditorController();

  if (!mounted) {
    return <div className="h-full min-h-0 bg-[#0d0d0d]" aria-hidden />;
  }

  switch (tabId) {
    case EDITOR_TAB_IDS.document:
      return (
        <WorkspaceBody>
          <MountedDocumentWorkspace />
        </WorkspaceBody>
      );
    case EDITOR_TAB_IDS.dictionaries:
      if (content.loading && dicts.loading) {
        return (
          <WorkspaceBody>
            <LoadingPlaceholder label="Caricamento…" />
          </WorkspaceBody>
        );
      }
      return (
        <WorkspaceBody>
          <MountedDictionariesWorkspace />
        </WorkspaceBody>
      );
    case EDITOR_TAB_IDS.ontology:
      if (content.loading) {
        return (
          <WorkspaceBody>
            <LoadingPlaceholder label="Caricamento tabella…" />
          </WorkspaceBody>
        );
      }
      return (
        <WorkspaceBody>
          <MountedOntologyWorkspace />
        </WorkspaceBody>
      );
    case EDITOR_TAB_IDS.disambiguation:
      return (
        <WorkspaceBody>
          <MountedDisambiguationWorkspace />
        </WorkspaceBody>
      );
    case EDITOR_TAB_IDS.report:
      return (
        <WorkspaceBody>
          <MountedCatalogReportWorkspace />
        </WorkspaceBody>
      );
    default:
      return null;
  }
});
