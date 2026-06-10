/**
 * Virtual agent analysis and test workspace.
 */
import { AnalysisView } from '../../components/DocumentViewer/AnalysisView';
import { useDocumentEditor } from '../document-editor/DocumentEditorContext';

export function AgentWorkspace() {
  const {
    doc,
    documentText,
    dictionaryMode,
    analysisApi,
    agentDictionaryContext,
    affinaOpen,
    setAffinaOpen,
    testOpen,
    setTestOpen,
    leafDescriptionMap,
    selectedSlot,
    setSelectedSlot,
    grammarEditTarget,
    setGrammarEditTarget,
    grammarOverwrite,
    setGrammarOverwrite,
    grammarTokens,
    handleTokenGrammarSaved,
  } = useDocumentEditor();

  const { generateMessagesOnly } = analysisApi;

  const handleGenerateDialogueMessages = () =>
    generateMessagesOnly(doc.name, documentText ?? '').catch(() => {});

  return (
    <AnalysisView
      doc={doc}
      documentText={documentText}
      analysisApi={analysisApi}
      externalToolbar
      dictionaryMode={dictionaryMode}
      agentDictionaryContext={agentDictionaryContext}
      onGenerateDialogueMessages={handleGenerateDialogueMessages}
      affinaOpen={affinaOpen}
      onAffinaOpenChange={setAffinaOpen}
      testOpen={testOpen}
      onTestOpenChange={setTestOpen}
      leafDescriptionMap={leafDescriptionMap}
      selectedSlot={selectedSlot}
      onSelectedSlotChange={setSelectedSlot}
      grammarEditTarget={grammarEditTarget}
      onGrammarEditTargetChange={setGrammarEditTarget}
      grammarOverwrite={grammarOverwrite}
      onGrammarOverwriteChange={setGrammarOverwrite}
      grammarTokens={grammarTokens}
      onTokenGrammarSaved={handleTokenGrammarSaved}
    />
  );
}
