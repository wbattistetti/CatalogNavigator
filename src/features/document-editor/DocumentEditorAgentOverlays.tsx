/**
 * Global modals for Convai export (no longer tied to AnalysisView tab).
 */
import { ConvaiExportPanel } from '../../components/DocumentViewer/ConvaiExportPanel';
import { ConvaiNoBeExportPanel } from '../../components/DocumentViewer/ConvaiNoBeExportPanel';
import { useDocumentEditorController } from './DocumentEditorContext';

export function DocumentEditorAgentOverlays() {
  const {
    doc,
    convaiOpen,
    setConvaiOpen,
    convaiNoBeOpen,
    setConvaiNoBeOpen,
    agentDictionaryContext,
    dictState,
    agentNeedsUpdate,
    liveLoadedRefs,
    analysisApi,
  } = useDocumentEditorController();

  const { analysis, analysisDirty } = analysisApi;
  const dictionary = agentDictionaryContext?.dictionary ?? null;
  const descriptions = agentDictionaryContext?.descriptions ?? [];

  if (!dictionary) return null;

  return (
    <>
      {convaiOpen && (
        <ConvaiExportPanel
          documentId={doc.id}
          documentName={doc.name}
          dictionary={dictionary}
          descriptions={descriptions}
          analysis={analysis}
          loadedRefs={liveLoadedRefs}
          dictionaryDirty={dictState?.dirty ?? false}
          analysisDirty={analysisDirty}
          pathsOutOfSync={agentNeedsUpdate}
          onClose={() => setConvaiOpen(false)}
        />
      )}
      {convaiNoBeOpen && (
        <ConvaiNoBeExportPanel
          documentId={doc.id}
          documentName={doc.name}
          dictionary={dictionary}
          descriptions={descriptions}
          analysis={analysis}
          loadedRefs={liveLoadedRefs}
          dictionaryDirty={dictState?.dirty ?? false}
          analysisDirty={analysisDirty}
          pathsOutOfSync={agentNeedsUpdate}
          onClose={() => setConvaiNoBeOpen(false)}
        />
      )}
    </>
  );
}
