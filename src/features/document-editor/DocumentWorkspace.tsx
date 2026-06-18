/**
 * Original document preview workspace.
 */
import { DocumentReader } from '../../components/DocumentViewer/DocumentReader';
import { useDocumentEditor } from './DocumentEditorContext';

export function DocumentWorkspace() {
  const { doc, fileUrl, content, onDocUpdated } = useDocumentEditor();
  return (
    <div className="flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden">
      <DocumentReader doc={doc} fileUrl={fileUrl} content={content} onDocUpdated={onDocUpdated} />
    </div>
  );
}
