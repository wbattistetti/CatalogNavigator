/**
 * Per-turn pass/fail checks for dialog test scripts (aligned with ChatPanel warnings).
 */
import {
  shouldAutoExpandUserTurnRecognition,
  type PendingDisambiguationContext,
} from '../chatUserTurnRecognition';
import type { DialogTestTurnRecord } from './dialogTestPlanTypes';

export function turnHasRecognitionWarning(turn: DialogTestTurnRecord): boolean {
  if ((turn.turnStuckReasons?.length ?? 0) > 0) return true;
  const recognition = turn.turnRecognition;
  if (!recognition) return false;
  return shouldAutoExpandUserTurnRecognition(recognition);
}

/** Returns a failure when the engine did not accept the user answer for this turn. */
export function evaluateTurnAfterResponse(params: {
  record: DialogTestTurnRecord;
  pendingBeforeTurn: PendingDisambiguationContext | null;
}): { ok: true } | { ok: false; status: 'fail' | 'stuck'; reason: string } {
  const { record, pendingBeforeTurn } = params;
  const action = record.action;

  if (action === 'no_match') {
    const stuck = (record.candidatePaths?.length ?? 0) > 1;
    return {
      ok: false,
      status: stuck ? 'stuck' : 'fail',
      reason: record.spokenHint ?? 'no_match',
    };
  }

  if (record.turnStuckReasons?.length) {
    return {
      ok: false,
      status: 'stuck',
      reason: record.turnStuckReasons.join(' · '),
    };
  }

  if (turnHasRecognitionWarning(record)) {
    return {
      ok: false,
      status: 'fail',
      reason: 'Risposta non allineata al contesto attivo.',
    };
  }

  const pendingSig = pendingBeforeTurn?.signature;
  if (
    pendingSig
    && record.disambiguationSignature === pendingSig
    && (action === 'disambiguate' || action === 'ask_age')
  ) {
    return {
      ok: false,
      status: 'fail',
      reason: 'Domanda ripetuta: risposta non accettata dal motore.',
    };
  }

  return { ok: true };
}
