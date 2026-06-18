/**
 * Full-height disambiguation dialog workspace (opened from toolbar "Messaggi").
 */
import { useCallback } from 'react';
import { X } from 'lucide-react';
import { DisambiguationWorkspace } from '../agent/DisambiguationWorkspace';
import { useDocumentEditorController } from './DocumentEditorContext';

interface DocumentEditorMessagesPanelProps {
  onClose: () => void;
}

export function DocumentEditorMessagesPanel({ onClose }: DocumentEditorMessagesPanelProps) {
  const {
    doc,
    documentText,
    analysisApi,
    agentDictionaryContext,
    dictState,
    agentNeedsUpdate,
    leafDescriptionMap,
    liveLoadedRefs,
  } = useDocumentEditorController();

  const {
    analysis,
    updateDisambiguationPlan,
    generateDisambiguationMessages,
    generating,
    generatingPhase,
    analysisDirty,
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
      <div className="flex-shrink-0 flex items-center justify-end px-3 py-1.5 border-b border-[#1a3a2a] bg-[#0a1510]">
        <button
          type="button"
          onClick={onClose}
          title="Chiudi pannello messaggi"
          className="flex items-center gap-1 px-2 py-1 font-mono text-xs text-emerald-400/50 border border-[#1a3a2a] rounded hover:text-emerald-300 hover:border-emerald-400/30 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          Chiudi
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <DisambiguationWorkspace
          analysis={analysis}
          dictionary={agentDictionaryContext?.dictionary ?? null}
          loadedRefs={liveLoadedRefs}
          dictionaryDirty={dictState?.dirty ?? false}
          analysisDirty={analysisDirty}
          pathsOutOfSync={agentNeedsUpdate}
          documentName={doc.name}
          documentId={doc.id}
          documentText={documentText ?? ''}
          generating={generating && generatingPhase === 'disambiguation'}
          leafDescriptionMap={leafDescriptionMap ?? undefined}
          onUpdatePlan={updateDisambiguationPlan}
          onGenerateMessages={handleGenerateDisambiguationMessages}
        />
      </div>
    </div>
  );
}
