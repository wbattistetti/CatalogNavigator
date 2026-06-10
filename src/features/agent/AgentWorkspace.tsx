/**
 * Virtual agent analysis and test workspace.
 */
import { AnalysisView } from '../../components/DocumentViewer/AnalysisView';
import { useDocumentEditor } from '../document-editor/DocumentEditorContext';

export function AgentWorkspace() {
  const {
    doc,
    documentText,
    analysisApi,
    affinaOpen,
    setAffinaOpen,
    testOpen,
    setTestOpen,
    leafDescriptionMap,
    selectedSlot,
    setSelectedSlot,
    grammarEditTarget,
    setGrammarEditTarget,
    showOnlyMessageNodes,
    grammarOverwrite,
    setGrammarOverwrite,
    grammarTokens,
    handleTokenGrammarSaved,
  } = useDocumentEditor();

  return (
    <AnalysisView
      doc={doc}
      documentText={documentText}
      analysisApi={analysisApi}
      externalToolbar
      affinaOpen={affinaOpen}
      onAffinaOpenChange={setAffinaOpen}
      testOpen={testOpen}
      onTestOpenChange={setTestOpen}
      leafDescriptionMap={leafDescriptionMap}
      selectedSlot={selectedSlot}
      onSelectedSlotChange={setSelectedSlot}
      grammarEditTarget={grammarEditTarget}
      onGrammarEditTargetChange={setGrammarEditTarget}
      showOnlyMessageNodes={showOnlyMessageNodes}
      grammarOverwrite={grammarOverwrite}
      onGrammarOverwriteChange={setGrammarOverwrite}
      grammarTokens={grammarTokens}
      onTokenGrammarSaved={handleTokenGrammarSaved}
    />
  );
}
