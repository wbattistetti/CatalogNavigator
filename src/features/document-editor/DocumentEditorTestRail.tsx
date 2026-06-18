/**
 * Full-height VB test panel mounted beside the main editor workspace.
 */
import { ChatPanel } from '../../components/DocumentViewer/ChatPanel';
import { useDocumentEditorController } from './DocumentEditorContext';
import { useTestAgentBundle } from './useTestAgentBundle';

export function DocumentEditorTestRail() {
  const { setTestOpen } = useDocumentEditorController();
  const agentBundle = useTestAgentBundle();

  return (
    <ChatPanel
      agentBundle={agentBundle}
      onClose={() => setTestOpen(false)}
    />
  );
}
