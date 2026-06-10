/**
 * Renders one main workspace at a time (panels stay mounted to preserve state).
 */
import { Loader2 } from 'lucide-react';
import { DictionariesWorkspace } from '../dictionaries/DictionariesWorkspace';
import { AgentWorkspace } from '../agent/AgentWorkspace';
import { OntologyWorkspace } from '../ontology/OntologyWorkspace';
import { DocumentWorkspace } from './DocumentWorkspace';
import { WorkspacePanel } from './WorkspacePanel';
import { useDocumentEditor } from './DocumentEditorContext';
import { EDITOR_TAB_IDS } from './editorTabIds';

export function DocumentEditorWorkspace() {
  const { content, dictionaryMode, activeTab } = useDocumentEditor();

  return (
    <div className="flex-1 min-h-0 overflow-hidden bg-[#0d0d0d] relative">
      <WorkspacePanel active={activeTab === EDITOR_TAB_IDS.document}>
        <DocumentWorkspace />
      </WorkspacePanel>

      {dictionaryMode && (
        <>
          <WorkspacePanel active={activeTab === EDITOR_TAB_IDS.dictionaries}>
            {content.loading ? (
              <div className="flex items-center justify-center h-full gap-2 text-emerald-400/30 font-mono text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Caricamento…
              </div>
            ) : (
              <DictionariesWorkspace />
            )}
          </WorkspacePanel>

          <WorkspacePanel active={activeTab === EDITOR_TAB_IDS.ontology}>
            <OntologyWorkspace />
          </WorkspacePanel>
        </>
      )}

      <WorkspacePanel active={activeTab === EDITOR_TAB_IDS.agent}>
        <AgentWorkspace />
      </WorkspacePanel>
    </div>
  );
}
