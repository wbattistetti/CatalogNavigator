/**
 * Corpus segmentation and ontology editing workspace.
 */
import { memo } from 'react';
import { Loader2 } from 'lucide-react';
import { DictionaryPanel } from '../../components/DocumentViewer/DictionaryPanel';
import { useDocumentEditorController, useDocumentEditorDictionaryNav } from '../document-editor/DocumentEditorContext';

export const OntologyWorkspace = memo(function OntologyWorkspace() {
  const {
    doc,
    content,
    dicts,
    descriptionColumn,
    ontologyColumns,
    descriptionColumns,
    corpusFromSelectorFallback,
    onDocUpdated,
    setDictState,
    handleDictionaryAfterSave,
    handleUnloadLibraryDictionary,
    syncNotice,
    analysisApi,
    corpusSegmentExclusions,
    removeCorpusSegment,
  } = useDocumentEditorController();
  const { openDictionaryTree } = useDocumentEditorDictionaryNav();

  const handleOpenDictionary = (dictionaryId: string) => {
    openDictionaryTree({ dictionaryId });
  };

  if (content.loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-emerald-400/30 font-mono text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Caricamento tabella…
      </div>
    );
  }

  if (!content.tabular) {
    return (
      <div className="flex items-center justify-center h-full text-emerald-400/30 font-mono text-sm px-8 text-center">
        Impossibile leggere la tabella da questo file.
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden">
      <DictionaryPanel
      doc={doc}
      tabular={content.tabular}
      dicts={dicts}
      ontologyColumns={ontologyColumns}
      descriptionColumns={descriptionColumns}
      corpusFromSelectorFallback={corpusFromSelectorFallback}
      descriptionColumn={descriptionColumn}
      onDocUpdated={onDocUpdated}
      onStateChange={setDictState}
      onAfterSave={handleDictionaryAfterSave}
      onUnloadLibraryDictionary={handleUnloadLibraryDictionary}
      onOpenDictionary={handleOpenDictionary}
      syncNotice={syncNotice}
      error={analysisApi.error}
      ontologyItemCount={analysisApi.analysis?.item_paths?.length ?? 0}
      corpusSegmentExclusions={corpusSegmentExclusions}
      onRemoveCorpusSegment={removeCorpusSegment}
    />
    </div>
  );
});
