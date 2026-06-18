/**
 * Document editor shell: fast tab strip + stacked workspaces; drag tab to split.
 */
import { useDocumentEditorController, useDocumentEditorTab } from './DocumentEditorContext';
import { DocumentEditorHeader } from './DocumentEditorHeader';
import { DocumentEditorToolbar } from './DocumentEditorToolbar';
import { DocumentEditorTabStrip } from './DocumentEditorTabStrip';
import { DocumentEditorWorkspace } from './DocumentEditorWorkspace';
import { DocumentEditorTestRail } from './DocumentEditorTestRail';
import { DocumentEditorMessagesPanel } from './DocumentEditorMessagesPanel';
import { DocumentEditorAgentOverlays } from './DocumentEditorAgentOverlays';
import { AffinaTaxonomyPanel } from './AffinaTaxonomyPanel';
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
    affinaOpen,
    setAffinaOpen,
    analysisApi,
  } = useDocumentEditorController();

  const { generating, generatingPhase, refineTaxonomy, hasTaxonomy } = analysisApi;

  const showTestRail = testOpen
    && dictionaryMode
    && (activeTab === EDITOR_TAB_IDS.ontology || messagesPanelOpen);

  const handleAffinaSubmit = (notes: string) => {
    void refineTaxonomy(notes);
    setAffinaOpen(false);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0 w-full max-w-full overflow-hidden">
      <DocumentEditorHeader />

      <div className="flex-shrink-0 flex flex-wrap items-end justify-between gap-x-2 gap-y-1 px-2 border-b border-[#1a3a2a] bg-[#080e0a] min-w-0 max-w-full overflow-x-auto scrollbar-thin">
        <DocumentEditorTabStrip />
        <DocumentEditorToolbar />
      </div>

      {affinaOpen && hasTaxonomy && (
        <AffinaTaxonomyPanel
          onClose={() => setAffinaOpen(false)}
          onSubmit={handleAffinaSubmit}
          generating={generating && generatingPhase === 'taxonomy'}
          hasTaxonomy={hasTaxonomy}
        />
      )}

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
