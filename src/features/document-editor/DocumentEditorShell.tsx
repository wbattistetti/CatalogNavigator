/**
 * Document editor shell: fast tab strip + stacked workspaces; drag tab to split.
 */
import { useDocumentEditorController, useDocumentEditorTab } from './DocumentEditorContext';
import { ProjectToolbarPortal, PROJECT_LEFT_ACTIONS_SLOT_ID } from './ProjectToolbarPortal';
import { DocumentEditorToolbar, ProjectLeftActions } from './DocumentEditorToolbar';
import { DocumentEditorTabStrip } from './DocumentEditorTabStrip';
import { DocumentEditorWorkspace } from './DocumentEditorWorkspace';
import { DocumentEditorTestRail } from './DocumentEditorTestRail';
import { DocumentEditorAgentOverlays } from './DocumentEditorAgentOverlays';
import { ResizableTestRail } from './ResizableTestRail';
import { OntologyRefreshProgressBar } from './OntologyRefreshProgressBar';
import { DisambiguationAiGenerationProgressBar } from './DisambiguationProgressBar';
import { CatalogSanityStrip } from './CatalogSanityStrip';
import { OntologySegmentationResumeDialog } from './OntologySegmentationResumeDialog';
import { EDITOR_TAB_IDS } from './editorTabIds';

function DisambiguationGenerationProgress() {
  const { analysisApi } = useDocumentEditorController();
  const { generating, generatingPhase, disambiguationGenProgress } = analysisApi;

  if (!generating || generatingPhase !== 'disambiguation') return null;

  if (disambiguationGenProgress) {
    return <DisambiguationAiGenerationProgressBar progress={disambiguationGenProgress} />;
  }

  return null;
}

export function DocumentEditorShell() {
  const { activeTab } = useDocumentEditorTab();
  const {
    dictionaryMode,
    testOpen,
    segmentationResumePromptOpen,
    confirmSegmentationResume,
    dismissSegmentationResumePrompt,
    partialSegmentationProcessed,
    partialSegmentationTotal,
    refreshingOntology,
  } = useDocumentEditorController();

  const showTestRail = testOpen
    && dictionaryMode
    && (activeTab === EDITOR_TAB_IDS.ontology || activeTab === EDITOR_TAB_IDS.disambiguation);

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
      <CatalogSanityStrip />

      <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
        <div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden">
          <DocumentEditorWorkspace />
        </div>
        {showTestRail && (
          <ResizableTestRail>
            <DocumentEditorTestRail />
          </ResizableTestRail>
        )}
      </div>

      <DocumentEditorAgentOverlays />

      <OntologySegmentationResumeDialog
        open={segmentationResumePromptOpen}
        processed={partialSegmentationProcessed}
        total={partialSegmentationTotal}
        starting={refreshingOntology}
        onResume={() => confirmSegmentationResume(true)}
        onStartFresh={() => confirmSegmentationResume(false)}
        onDismiss={dismissSegmentationResumePrompt}
      />
    </div>
  );
}
