/**
 * Corpus segmentation and ontology editing workspace.
 */
import { Loader2 } from 'lucide-react';
import { DictionaryPanel } from '../../components/DocumentViewer/DictionaryPanel';
import { useDocumentEditor } from '../document-editor/DocumentEditorContext';

export function OntologyWorkspace() {
  const {
    doc,
    content,
    dicts,
    descriptionColumn,
    onDocUpdated,
    setDictState,
    handleDictionaryAfterSave,
    syncNotice,
    analysisApi,
  } = useDocumentEditor();

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
    <DictionaryPanel
      doc={doc}
      tabular={content.tabular}
      dicts={dicts}
      descriptionColumn={descriptionColumn}
      onDocUpdated={onDocUpdated}
      onStateChange={setDictState}
      onAfterSave={handleDictionaryAfterSave}
      syncNotice={syncNotice}
      error={analysisApi.error}
    />
  );
}
