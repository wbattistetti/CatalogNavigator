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
import { ReadableCatalogWorkspace } from '../ontology/ReadableCatalogWorkspace';
import { SavedChatTestsWorkspace } from '../ontology/SavedChatTestsWorkspace';
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

const MountedReadableCatalogWorkspace = memo(function MountedReadableCatalogWorkspace() {
  return <ReadableCatalogWorkspace />;
});

const MountedCatalogReportWorkspace = memo(function MountedCatalogReportWorkspace() {
  return <CatalogReportWorkspace />;
});

const MountedSavedChatTestsWorkspace = memo(function MountedSavedChatTestsWorkspace() {
  return <SavedChatTestsWorkspace />;
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
  const { content, dicts, analysisApi } = useDocumentEditorController();

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
    case EDITOR_TAB_IDS.readableCatalog:
      return (
        <WorkspaceBody>
          <MountedReadableCatalogWorkspace />
        </WorkspaceBody>
      );
    case EDITOR_TAB_IDS.report:
      return (
        <WorkspaceBody>
          <MountedCatalogReportWorkspace />
        </WorkspaceBody>
      );
    case EDITOR_TAB_IDS.savedChatTests:
      if (analysisApi.loading && !analysisApi.initialLoadDone) {
        return (
          <WorkspaceBody>
            <LoadingPlaceholder label="Caricamento test salvati…" />
          </WorkspaceBody>
        );
      }
      return (
        <WorkspaceBody>
          <MountedSavedChatTestsWorkspace />
        </WorkspaceBody>
      );
    default:
      return null;
  }
});
