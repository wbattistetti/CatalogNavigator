/**
 * Virtual agent analysis and test workspace.
 */
import { useState, useCallback } from 'react';
import { AnalysisView } from '../../components/DocumentViewer/AnalysisView';
import { useDocumentEditor } from '../document-editor/DocumentEditorContext';
import { DisambiguationWorkspace } from './DisambiguationWorkspace';

type AgentSubView = 'taxonomy' | 'disambiguation';

function AgentSubTab({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 font-mono text-xs uppercase tracking-wider border-b-2 transition-colors ${
        active
          ? 'border-emerald-400 text-emerald-300'
          : 'border-transparent text-emerald-400/45 hover:text-emerald-400/70'
      }`}
    >
      {label}
    </button>
  );
}

export function AgentWorkspace() {
  const [subView, setSubView] = useState<AgentSubView>('taxonomy');
  const {
    doc,
    documentText,
    dictionaryMode,
    analysisApi,
    agentDictionaryContext,
    affinaOpen,
    setAffinaOpen,
    convaiOpen,
    setConvaiOpen,
    convaiNoBeOpen,
    setConvaiNoBeOpen,
    dictState,
    agentNeedsUpdate,
    leafDescriptionMap,
    selectedSlot,
    setSelectedSlot,
    grammarEditTarget,
    setGrammarEditTarget,
    grammarOverwrite,
    setGrammarOverwrite,
    grammarTokens,
    handleTokenGrammarSaved,
    pathOrderingCategories,
    liveLoadedRefs,
  } = useDocumentEditor();

  const { generateMessagesOnly, analysis, updateDisambiguationPlan, generateDisambiguationMessages, generating, generatingPhase } = analysisApi;
  const leafMap = leafDescriptionMap ?? undefined;

  const handleGenerateDialogueMessages = () =>
    generateMessagesOnly(doc.name, documentText ?? '').catch(() => {});

  const handleGenerateDisambiguationMessages = useCallback(
    (rows: Parameters<typeof generateDisambiguationMessages>[0], options?: Parameters<typeof generateDisambiguationMessages>[3]) =>
      generateDisambiguationMessages(rows, doc.name, documentText ?? '', options),
    [generateDisambiguationMessages, doc.name, documentText],
  );

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="flex-shrink-0 flex items-center gap-1 px-4 border-b border-[#1a3a2a] bg-[#0a1510]">
        <AgentSubTab
          active={subView === 'taxonomy'}
          label="Tassonomia"
          onClick={() => setSubView('taxonomy')}
        />
        <AgentSubTab
          active={subView === 'disambiguation'}
          label="Disambiguazione"
          onClick={() => setSubView('disambiguation')}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {subView === 'disambiguation' ? (
          <DisambiguationWorkspace
            analysis={analysis}
            dictionary={agentDictionaryContext?.dictionary ?? null}
            loadedRefs={liveLoadedRefs}
            dictionaryDirty={dictState?.dirty ?? false}
            analysisDirty={analysisApi.analysisDirty}
            pathsOutOfSync={agentNeedsUpdate}
            documentName={doc.name}
            documentId={doc.id}
            documentText={documentText ?? ''}
            generating={generating && generatingPhase === 'disambiguation'}
            leafDescriptionMap={leafMap}
            onUpdatePlan={updateDisambiguationPlan}
            onGenerateMessages={handleGenerateDisambiguationMessages}
          />
        ) : (
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
            convaiOpen={convaiOpen}
            onConvaiOpenChange={setConvaiOpen}
            convaiNoBeOpen={convaiNoBeOpen}
            onConvaiNoBeOpenChange={setConvaiNoBeOpen}
            convaiExportContext={{
              dictionary: agentDictionaryContext?.dictionary ?? null,
              descriptions: agentDictionaryContext?.descriptions ?? [],
              loadedRefs: liveLoadedRefs,
              dictionaryDirty: dictState?.dirty ?? false,
              pathsOutOfSync: agentNeedsUpdate,
            }}
            leafDescriptionMap={leafMap}
            selectedSlot={selectedSlot}
            onSelectedSlotChange={setSelectedSlot}
            grammarEditTarget={grammarEditTarget}
            onGrammarEditTargetChange={setGrammarEditTarget}
            grammarOverwrite={grammarOverwrite}
            onGrammarOverwriteChange={setGrammarOverwrite}
            grammarTokens={grammarTokens}
            onTokenGrammarSaved={handleTokenGrammarSaved}
            pathOrderingCategories={pathOrderingCategories}
          />
        )}
      </div>
    </div>
  );
}
