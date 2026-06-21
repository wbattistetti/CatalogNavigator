/**
 * React hook: generate dialog test plan and run scripts against VB engine.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AgentBundle } from '../../lib/agentBundleTypes';
import { generateDialogTestPlan } from '../../lib/dialogTestPlan/dialogTestPlanGenerate';
import { runDialogTestScript } from '../../lib/dialogTestPlan/dialogTestPlanRunner';
import type { RowSegmentation } from '../../lib/tokenDictionary';
import {
  DIALOG_TEST_FAMILIES,
  type DialogTestFamily,
  type DialogTestFamilyRunState,
  type DialogTestManualSession,
  type DialogTestPlan,
} from '../../lib/dialogTestPlan/dialogTestPlanTypes';

function emptyFamilyState(): Record<DialogTestFamily, DialogTestFamilyRunState> {
  return {
    minimal: { status: 'idle' },
    intermediate: { status: 'idle' },
    complete: { status: 'idle' },
  };
}

function runKey(voiceId: string, family: DialogTestFamily): string {
  return `${voiceId}::${family}`;
}

export interface DialogTestPlanSummary {
  total: number;
  reachable: number;
  passed: number;
  failed: number;
  stuck: number;
  unreachable: number;
  pending: number;
}

export function useDialogTestPlan(
  bundle: AgentBundle | null,
  segmentationRows: readonly RowSegmentation[] = [],
) {
  const [plan, setPlan] = useState<DialogTestPlan | null>(null);
  const [runState, setRunState] = useState<Record<string, DialogTestFamilyRunState>>({});
  const [manualSessions, setManualSessions] = useState<DialogTestManualSession[]>([]);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const regenerate = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
    if (!bundle) {
      setPlan(null);
      setRunState({});
      return;
    }
    setPlan(generateDialogTestPlan(bundle, segmentationRows));
    setRunState({});
  }, [bundle, segmentationRows]);

  useEffect(() => {
    regenerate();
  }, [regenerate]);

  const setFamilyState = useCallback((
    voiceId: string,
    family: DialogTestFamily,
    patch: DialogTestFamilyRunState,
  ) => {
    setRunState((prev) => ({
      ...prev,
      [runKey(voiceId, family)]: patch,
    }));
  }, []);

  const runFamily = useCallback(async (
    voiceId: string,
    family: DialogTestFamily,
    opts?: { signal?: AbortSignal },
  ) => {
    if (!bundle || !plan) return;
    const voice = plan.voices.find((v) => v.id === voiceId);
    if (!voice) return;

    if (!voice.reachable) {
      setFamilyState(voiceId, family, {
        status: 'fail',
        error: 'Nessuno step script generabile per questa voce.',
      });
      return;
    }

    const script = voice.scripts[family];
    if (script.userSteps.length === 0) {
      setFamilyState(voiceId, family, {
        status: 'fail',
        error: 'Script vuoto.',
      });
      return;
    }

    setFamilyState(voiceId, family, { status: 'running', transcript: [] });

    try {
      const result = await runDialogTestScript({
        bundle,
        targetPath: voice.targetPath,
        userSteps: script.userSteps,
        signal: opts?.signal,
        onProgress: (transcript) => {
          setFamilyState(voiceId, family, {
            status: 'running',
            transcript,
            finalPath: transcript[transcript.length - 1]?.selectedPath ?? null,
          });
        },
      });
      setFamilyState(voiceId, family, {
        status: result.status,
        result,
        transcript: result.transcript,
        finalPath: result.finalPath ?? null,
      });
    } catch (err) {
      setFamilyState(voiceId, family, {
        status: 'fail',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, [bundle, plan, setFamilyState]);

  const runBatch = useCallback(async (filter: 'all' | 'failed') => {
    if (!bundle || !plan || running) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);

    try {
      for (const voice of plan.voices) {
        for (const family of DIALOG_TEST_FAMILIES) {
          if (controller.signal.aborted) break;
          const key = runKey(voice.id, family);
          const prev = runState[key];
          if (filter === 'failed') {
            const s = prev?.status ?? 'idle';
            if (s !== 'fail' && s !== 'stuck') continue;
          }
          await runFamily(voice.id, family, { signal: controller.signal });
        }
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [bundle, plan, runFamily, runState, running]);

  const runAll = useCallback(() => runBatch('all'), [runBatch]);
  const runFailed = useCallback(() => runBatch('failed'), [runBatch]);

  const cancelRun = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const addManualSession = useCallback((voiceId: string) => {
    const id = `${voiceId}-manual-${Date.now()}`;
    setManualSessions((prev) => [
      ...prev,
      { id, label: `Manuale ${prev.filter((s) => s.id.startsWith(voiceId)).length + 1}` },
    ]);
  }, []);

  const getVoiceFamilyState = useCallback((voiceId: string): Record<DialogTestFamily, DialogTestFamilyRunState> => {
    const base = emptyFamilyState();
    for (const family of DIALOG_TEST_FAMILIES) {
      base[family] = runState[runKey(voiceId, family)] ?? { status: 'idle' };
    }
    return base;
  }, [runState]);

  const summary = useMemo((): DialogTestPlanSummary => {
    const voices = plan?.voices ?? [];
    let passed = 0;
    let failed = 0;
    let stuck = 0;
    let pending = 0;

    for (const voice of voices) {
      for (const family of DIALOG_TEST_FAMILIES) {
        const st = runState[runKey(voice.id, family)]?.status ?? 'idle';
        if (st === 'pass') passed += 1;
        else if (st === 'stuck') stuck += 1;
        else if (st === 'fail') failed += 1;
        else if (st === 'idle' && voice.reachable) pending += 1;
      }
    }

    return {
      total: voices.length * DIALOG_TEST_FAMILIES.length,
      reachable: voices.filter((v) => v.reachable).length,
      passed,
      failed,
      stuck,
      unreachable: voices.filter((v) => !v.reachable).length,
      pending,
    };
  }, [plan, runState]);

  return {
    plan,
    runState,
    running,
    summary,
    manualSessions,
    regenerate,
    runAll,
    runFailed,
    runFamily,
    cancelRun,
    addManualSession,
    getVoiceFamilyState,
  };
}
