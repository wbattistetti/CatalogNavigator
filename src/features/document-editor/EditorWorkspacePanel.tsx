/**
 * Body for one main editor tab (document, dictionaries, ontology, agent).
 */
import { memo } from 'react';
import { Loader2 } from 'lucide-react';
import { DictionariesWorkspace } from '../dictionaries/DictionariesWorkspace';
import { AgentWorkspace } from '../agent/AgentWorkspace';
import { OntologyWorkspace } from '../ontology/OntologyWorkspace';
import { useDocumentEditorController } from './DocumentEditorContext';
import { DocumentWorkspace } from './DocumentWorkspace';
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

const MountedAgentWorkspace = memo(function MountedAgentWorkspace() {
  return <AgentWorkspace />;
});

function LoadingPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-full gap-2 text-emerald-400/30 font-mono text-sm">
      <Loader2 className="w-4 h-4 animate-spin" />
      {label}
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
      return <MountedDocumentWorkspace />;
    case EDITOR_TAB_IDS.dictionaries:
      if (content.loading || dicts.loading) {
        return <LoadingPlaceholder label="Caricamento…" />;
      }
      return <MountedDictionariesWorkspace />;
    case EDITOR_TAB_IDS.ontology:
      if (content.loading) {
        return <LoadingPlaceholder label="Caricamento tabella…" />;
      }
      return <MountedOntologyWorkspace />;
    case EDITOR_TAB_IDS.agent:
      return <MountedAgentWorkspace />;
    default:
      return null;
  }
});
