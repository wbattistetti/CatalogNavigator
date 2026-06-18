/**
 * Full-height VB test panel mounted beside the main editor workspace.
 */
import { useCallback } from 'react';
import {
  ChatPanel,
  type DisambiguationPlanMessagePatch,
} from '../../components/DocumentViewer/ChatPanel';
import { patchDisambiguationPlanMessage } from '../../lib/disambiguationPlanMessages';
import { useDocumentEditorController } from './DocumentEditorContext';
import { useTestAgentBundle } from './useTestAgentBundle';

export function DocumentEditorTestRail() {
  const { setTestOpen, analysisApi } = useDocumentEditorController();
  const agentBundle = useTestAgentBundle();
  const { analysis, updateDisambiguationPlan } = analysisApi;

  const onPatchDisambiguationMessage = useCallback((patch: DisambiguationPlanMessagePatch) => {
    const { signature, ...fields } = patch;
    const next = patchDisambiguationPlanMessage(analysis?.disambiguation_plan, signature, fields);
    updateDisambiguationPlan(next);
  }, [analysis?.disambiguation_plan, updateDisambiguationPlan]);

  return (
    <ChatPanel
      agentBundle={agentBundle}
      onClose={() => setTestOpen(false)}
      onPatchDisambiguationMessage={onPatchDisambiguationMessage}
    />
  );
}
