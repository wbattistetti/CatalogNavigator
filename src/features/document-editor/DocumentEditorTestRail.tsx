/**
 * Full-height VB test panel mounted beside the main editor workspace.
 */
import { useCallback } from 'react';
import {
  ChatPanel,
  type ChatPanelSavePayload,
  type DisambiguationPlanMessagePatch,
} from '../../components/DocumentViewer/ChatPanel';
import { patchDisambiguationPlanMessage } from '../../lib/disambiguationPlanMessages';
import type { OpenDisambiguationFromChatOptions } from '../../lib/grammarTuningFromChat';
import { useDocumentEditorController } from './DocumentEditorContext';
import { useTestAgentBundle } from './useTestAgentBundle';

export function DocumentEditorTestRail() {
  const {
    setTestOpen,
    analysisApi,
    openDisambiguationMessage,
    chatTurnReplayRequest,
    clearChatTurnReplayRequest,
    requestChatTurnReplay,
  } = useDocumentEditorController();
  const agentBundle = useTestAgentBundle();
  const { analysis, updateDisambiguationPlan } = analysisApi;

  const onPatchDisambiguationMessage = useCallback((patch: DisambiguationPlanMessagePatch) => {
    const { signature, ...fields } = patch;
    const next = patchDisambiguationPlanMessage(analysis?.disambiguation_plan, signature, fields);
    updateDisambiguationPlan(next);
  }, [analysis?.disambiguation_plan, updateDisambiguationPlan]);

  const onOpenDisambiguationFromChat = useCallback((
    signature: string,
    opts?: OpenDisambiguationFromChatOptions,
  ) => {
    openDisambiguationMessage(signature, opts ?? { focusGrammar: true });
  }, [openDisambiguationMessage]);

  const onSaveChat = useCallback((payload: ChatPanelSavePayload) => {
    analysisApi.saveChatTest(payload.messages, payload.selectedPath);
  }, [analysisApi]);

  return (
    <ChatPanel
      agentBundle={agentBundle}
      onClose={() => setTestOpen(false)}
      onPatchDisambiguationMessage={onPatchDisambiguationMessage}
      onOpenDisambiguationMessage={onOpenDisambiguationFromChat}
      onRequestChatTurnReplay={requestChatTurnReplay}
      onSaveChat={onSaveChat}
      chatTurnReplayRequest={chatTurnReplayRequest}
      onChatTurnReplayHandled={clearChatTurnReplayRequest}
    />
  );
}
