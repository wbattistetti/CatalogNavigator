/**
 * Entry point when a document is selected in the sidebar.
 */
import type { KbDocument } from '../lib/supabase';
import { DocumentEditorProvider } from '../features/document-editor/DocumentEditorContext';
import { DocumentEditorShell } from '../features/document-editor/DocumentEditorShell';

interface MainPanelProps {
  doc: KbDocument;
  fileUrl: string;
  onDocUpdated: (doc: KbDocument) => void;
}

export function MainPanel({ doc, fileUrl, onDocUpdated }: MainPanelProps) {
  return (
    <DocumentEditorProvider doc={doc} fileUrl={fileUrl} onDocUpdated={onDocUpdated}>
      <DocumentEditorShell />
    </DocumentEditorProvider>
  );
}
