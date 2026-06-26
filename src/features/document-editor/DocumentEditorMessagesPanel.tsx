/**

 * Disambiguation dialog workspace — main editor tab (Messaggi di disambiguazione).

 */

import { useCallback } from 'react';

import { DisambiguationWorkspace } from '../agent/DisambiguationWorkspace';

import { useDocumentEditorController } from './DocumentEditorContext';



export function DocumentEditorMessagesPanel() {

  const {

    doc,

    documentText,

    analysisApi,

    agentDictionaryContext,

    disambiguationWorkspaceDictionary,

    disambiguationDescriptions,

    dictState,

    agentNeedsUpdate,

    leafDescriptionMap,

    liveLoadedRefs,

    corpusSegmentExclusions,

    corpusItemExclusions,

    removeCorpusSegment,

    excludeCorpusSegmentOccurrence,

    excludeCorpusItem,

    restoreCorpusItem,

    disambiguationNavRequest,

    clearDisambiguationNavRequest,

  } = useDocumentEditorController();



  const {

    analysis,

    updateDisambiguationPlan,

    commitResolvedItemPaths,

    disambiguationPlanResult,

    setDisambiguationPlanResult,

    generateDisambiguationMessages,

    generating,

    generatingPhase,

    analysisDirty,

    updateAgentConfig,

  } = analysisApi;



  const handleGenerateDisambiguationMessages = useCallback(

    (

      rows: Parameters<typeof generateDisambiguationMessages>[0],

      options?: Parameters<typeof generateDisambiguationMessages>[3],

    ) => generateDisambiguationMessages(rows, doc.name, documentText ?? '', options),

    [generateDisambiguationMessages, doc.name, documentText],

  );



  return (

    <div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden bg-[#0a0f0c]">

      <DisambiguationWorkspace

        analysis={analysis}

        dictionary={disambiguationWorkspaceDictionary}

        descriptions={disambiguationDescriptions}

        loadedRefs={liveLoadedRefs}

        dictionaryDirty={dictState?.dirty ?? false}

        analysisDirty={analysisDirty}

        pathsOutOfSync={agentNeedsUpdate}

        documentName={doc.name}

        documentId={doc.id}

        documentText={documentText ?? ''}

        generating={generating && generatingPhase === 'disambiguation'}

        leafDescriptionMap={leafDescriptionMap ?? undefined}

        segmentExclusions={corpusSegmentExclusions}

        itemExclusions={corpusItemExclusions}

        onExcludeCorpusItem={excludeCorpusItem}

        onRestoreCorpusItem={restoreCorpusItem}

        onExcludeCorpusSegment={removeCorpusSegment}

        onExcludeCorpusSegmentOccurrence={excludeCorpusSegmentOccurrence}

        onUpdatePlan={updateDisambiguationPlan}

        onCommitResolvedItemPaths={commitResolvedItemPaths}

        plan={disambiguationPlanResult}

        onPlanChange={setDisambiguationPlanResult}

        onGenerateMessages={handleGenerateDisambiguationMessages}

        navRequest={disambiguationNavRequest}

        onNavRequestHandled={clearDisambiguationNavRequest}

        onUpdateAgentConfig={updateAgentConfig}

      />

    </div>

  );

}


