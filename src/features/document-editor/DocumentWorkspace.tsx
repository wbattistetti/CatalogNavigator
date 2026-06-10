/**
 * Original document preview workspace.
 */
import { DocumentReader } from '../../components/DocumentViewer/DocumentReader';
import { useDocumentEditor } from './DocumentEditorContext';

export function DocumentWorkspace() {
  const { doc, fileUrl, content, onDocUpdated } = useDocumentEditor();
  return (
    <DocumentReader doc={doc} fileUrl={fileUrl} content={content} onDocUpdated={onDocUpdated} />
  );
}
