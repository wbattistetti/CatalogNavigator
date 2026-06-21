/**
 * Executes a dialog test script against the VB test engine (ChatPanel-compatible turns).
 */
import type { AgentBundle, AgentSessionState } from '../agentBundleTypes';
import type { PendingDisambiguationContext } from '../chatUserTurnRecognition';
import { buildAnswerContextFromPending } from '../pendingDisambiguationAnswerContext';
import { initAgentSession, postVbTextTurn } from '../vbTestEngineClient';
import type { DialogTestRunResult, DialogTestTurnRecord } from './dialogTestPlanTypes';
import { buildDialogTestTurnRecord } from './dialogTestPlanTurnRecord';
import { evaluateTurnAfterResponse } from './dialogTestPlanTurnEvaluation';

function pendingFromTurnRecord(record: DialogTestTurnRecord): PendingDisambiguationContext | null {
  if (!record.disambiguationCategory?.trim()) return null;
  const options = (record.disambiguationOptions ?? []).map((o) => o.trim()).filter(Boolean);
  if (options.length === 0) return null;
  return {
    categoryName: record.disambiguationCategory,
    options,
    signature: record.disambiguationSignature,
  };
}

/**
 * Runs user steps sequentially; passes when the engine confirms the target path.
 */
export async function runDialogTestScript(params: {
  bundle: AgentBundle;
  targetPath: string;
  userSteps: readonly string[];
  signal?: AbortSignal;
  onProgress?: (transcript: DialogTestTurnRecord[]) => void;
}): Promise<DialogTestRunResult> {
  const started = Date.now();
  const transcript: DialogTestTurnRecord[] = [];

  if (params.userSteps.length === 0) {
    return {
      status: 'fail',
      reason: 'Script vuoto.',
      transcript,
      durationMs: Date.now() - started,
    };
  }

  let state: AgentSessionState = initAgentSession();
  let lastPending: PendingDisambiguationContext | null = null;

  for (let i = 0; i < params.userSteps.length; i += 1) {
    if (params.signal?.aborted) {
      return {
        status: 'skipped',
        reason: 'Esecuzione annullata.',
        transcript,
        durationMs: Date.now() - started,
      };
    }

    const userText = params.userSteps[i]!.trim();
    if (!userText) {
      return {
        status: 'fail',
        reason: `Turno ${i + 1} vuoto.`,
        transcript,
        durationMs: Date.now() - started,
      };
    }

    const priorSession = state;
    const answerContext = buildAnswerContextFromPending(lastPending);

    params.onProgress?.([...transcript, { userText }]);

    const result = await postVbTextTurn({
      userText,
      bundle: params.bundle,
      state,
      reset: i === 0,
      answerContext,
    });

    const record = buildDialogTestTurnRecord({
      userText,
      result,
      bundle: params.bundle,
      priorSession,
      pending: lastPending,
    });

    transcript.push(record);
    params.onProgress?.([...transcript]);
    state = result.nextState ?? state;

    const turnCheck = evaluateTurnAfterResponse({
      record,
      pendingBeforeTurn: lastPending,
    });
    lastPending = pendingFromTurnRecord(record);

    if (!turnCheck.ok) {
      return {
        status: turnCheck.status,
        reason: turnCheck.reason,
        transcript,
        durationMs: Date.now() - started,
      };
    }

    const action = result.instruction?.action;

    if (action === 'confirm') {
      const path = result.selectedPath ?? result.instruction?.path ?? null;
      if (path === params.targetPath) {
        return {
          status: 'pass',
          finalPath: path,
          transcript,
          durationMs: Date.now() - started,
        };
      }
      return {
        status: 'fail',
        reason: `Confirm su «${path ?? '?'}», atteso «${params.targetPath}».`,
        finalPath: path,
        transcript,
        durationMs: Date.now() - started,
      };
    }

    if (action === 'dead' || action === 'stuck') {
      return {
        status: 'fail',
        reason: `Motore: ${action}.`,
        transcript,
        durationMs: Date.now() - started,
      };
    }
  }

  return {
    status: 'fail',
    reason: 'Script esaurito senza confirm.',
    transcript,
    durationMs: Date.now() - started,
  };
}
