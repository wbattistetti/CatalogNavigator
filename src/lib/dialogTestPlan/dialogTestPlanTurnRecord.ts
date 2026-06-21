/**
 * Maps VB engine responses to rich Test Plan turn records (ChatPanel parity).
 */
import type { AgentBundle, AgentSessionState } from '../agentBundleTypes';
import { buildChatTurnDebug } from '../chatTurnDebug';
import {
  buildUserTurnRecognition,
  type PendingDisambiguationContext,
} from '../chatUserTurnRecognition';
import { buildChatStuckDiagnosis } from '../chatStuckDiagnosis';
import type { VbTextTurnResponse } from '../vbTestEngineClient';
import type { DialogTestTurnRecord } from './dialogTestPlanTypes';

function resolveDisambiguationOptions(result: VbTextTurnResponse): {
  categoryName?: string;
  options?: string[];
} {
  const action = result.instruction?.action;
  if (action !== 'disambiguate' && action !== 'ask_age') return {};
  const options = (result.instruction?.options ?? []).map((o) => o.trim()).filter(Boolean);
  if (options.length === 0) return {};
  const categoryName = result.instruction?.categoryName?.trim();
  return { categoryName: categoryName || undefined, options };
}

function resolveHintSource(result: VbTextTurnResponse): DialogTestTurnRecord['hintSource'] {
  const source = result.spokenHintSource;
  if (
    (result.instruction?.action === 'disambiguate' || result.instruction?.action === 'ask_age')
    && (source === 'disambiguation_plan'
      || source === 'disambiguation_plan_no_match'
      || source === 'template')
  ) {
    return source;
  }
  return undefined;
}

/** Builds a turn record with disambiguation + recognition metadata for chat UI. */
export function buildDialogTestTurnRecord(params: {
  userText: string;
  result: VbTextTurnResponse;
  bundle: AgentBundle;
  priorSession: AgentSessionState | null;
  pending: PendingDisambiguationContext | null;
}): DialogTestTurnRecord {
  const { userText, result, bundle, priorSession, pending } = params;
  const { categoryName, options } = resolveDisambiguationOptions(result);

  const turnRecognition = buildUserTurnRecognition({
    userText,
    bundle,
    vbParsed: result.parsed,
    pending,
    priorSession,
  });

  let turnStuckReasons: string[] | undefined;
  if (result.instruction?.action === 'no_match' && turnRecognition) {
    turnStuckReasons = buildChatStuckDiagnosis({
      recognition: turnRecognition,
      priorSession,
      vbResult: result,
      planOptions: turnRecognition.planOptions,
    }).reasons;
  }

  return {
    userText,
    action: result.instruction?.action,
    selectedPath: result.selectedPath,
    spokenHint: result.spokenHint,
    disambiguationCategory: categoryName,
    disambiguationOptions: options,
    disambiguationSignature: result.disambiguationSignature,
    candidatePaths: result.candidatePaths,
    hintSource: resolveHintSource(result),
    turnDebug: buildChatTurnDebug(result, bundle),
    turnRecognition,
    turnStuckReasons: turnStuckReasons?.length ? turnStuckReasons : undefined,
  };
}
