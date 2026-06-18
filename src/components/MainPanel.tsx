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
    <div className="flex flex-col flex-1 min-h-0 min-w-0 w-full max-w-full overflow-hidden">
      <DocumentEditorProvider doc={doc} fileUrl={fileUrl} onDocUpdated={onDocUpdated}>
        <div className="flex flex-col flex-1 min-h-0 min-w-0 w-full max-w-full overflow-hidden">
          <DocumentEditorShell />
        </div>
      </DocumentEditorProvider>
    </div>
  );
}
