/**
 * Document editor shell: fast tab strip + stacked workspaces; drag tab to split.
 */
import { useDocumentEditorController, useDocumentEditorTab } from './DocumentEditorContext';
import { ProjectToolbarPortal, PROJECT_LEFT_ACTIONS_SLOT_ID } from './ProjectToolbarPortal';
import { DocumentEditorToolbar, ProjectLeftActions } from './DocumentEditorToolbar';
import { DocumentEditorTabStrip } from './DocumentEditorTabStrip';
import { DocumentEditorWorkspace } from './DocumentEditorWorkspace';
import { DocumentEditorTestRail } from './DocumentEditorTestRail';
import { DocumentEditorMessagesPanel } from './DocumentEditorMessagesPanel';
import { DocumentEditorAgentOverlays } from './DocumentEditorAgentOverlays';
import { ResizableTestRail } from './ResizableTestRail';
import { OntologyRefreshProgressBar } from './OntologyRefreshProgressBar';
import { EDITOR_TAB_IDS } from './editorTabIds';
import { Loader2 } from 'lucide-react';

function DisambiguationGenerationProgress() {
  const { analysisApi } = useDocumentEditorController();
  const { generating, generatingPhase } = analysisApi;

  if (!generating || generatingPhase !== 'disambiguation') return null;

  return (
    <div className="flex-shrink-0 px-4 py-2 border-b border-[#1a3a2a] bg-[#0a1510]">
      <div className="flex items-center gap-2 font-mono text-sm text-emerald-400/70">
        <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
        Generazione messaggi dialogo con IA…
      </div>
    </div>
  );
}

export function DocumentEditorShell() {
  const { activeTab } = useDocumentEditorTab();
  const {
    dictionaryMode,
    testOpen,
    messagesPanelOpen,
    setMessagesPanelOpen,
  } = useDocumentEditorController();

  const showTestRail = testOpen
    && dictionaryMode
    && (activeTab === EDITOR_TAB_IDS.ontology || messagesPanelOpen);

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0 w-full max-w-full overflow-hidden">
      <ProjectToolbarPortal slotId={PROJECT_LEFT_ACTIONS_SLOT_ID}>
        <ProjectLeftActions />
      </ProjectToolbarPortal>
      <ProjectToolbarPortal>
        <DocumentEditorToolbar />
      </ProjectToolbarPortal>

      <div className="flex-shrink-0 px-2 border-b border-[#1a3a2a] bg-[#080e0a] min-w-0 max-w-full overflow-x-auto scrollbar-thin">
        <DocumentEditorTabStrip />
      </div>

      <DisambiguationGenerationProgress />
      <OntologyRefreshProgressBar />

      <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
        <div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden">
          {messagesPanelOpen ? (
            <DocumentEditorMessagesPanel onClose={() => setMessagesPanelOpen(false)} />
          ) : (
            <DocumentEditorWorkspace />
          )}
        </div>
        {showTestRail && (
          <ResizableTestRail>
            <DocumentEditorTestRail />
          </ResizableTestRail>
        )}
      </div>

      <DocumentEditorAgentOverlays />
    </div>
  );
}
