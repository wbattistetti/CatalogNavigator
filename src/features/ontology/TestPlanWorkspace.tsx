/**
 * Test Plan tab — auto-generated dialog regression per corpus voice.
 */
import { useState, type ReactNode } from 'react';
import {
  ChevronDown,
  Circle,
  Loader2,
  Play,
  RefreshCw,
  Square,
  TestTube2,
} from 'lucide-react';
import {
  DIALOG_TEST_FAMILIES,
  DIALOG_TEST_FAMILY_HINTS,
  DIALOG_TEST_FAMILY_LABELS,
  type DialogTestFamily,
  type DialogTestFamilyRunState,
  type DialogTestRunStatus,
  type DialogTestVoice,
} from '../../lib/dialogTestPlan/dialogTestPlanTypes';
import { shouldUseVbTestEngine } from '../../lib/vbTestEngineClient';
import { useDocumentEditorController } from '../document-editor/DocumentEditorContext';
import { useTestAgentBundle, useTestPlanSegmentationRows } from '../document-editor/useTestAgentBundle';
import { useDialogTestPlan } from '../document-editor/useDialogTestPlan';
import { TestPlanChatTranscript } from './TestPlanChatTranscript';

function statusColor(status: DialogTestRunStatus): string {
  switch (status) {
    case 'pass':
      return 'text-emerald-300 border-emerald-400/50 bg-emerald-400/10';
    case 'fail':
      return 'text-red-300 border-red-400/50 bg-red-400/10';
    case 'stuck':
      return 'text-amber-300 border-amber-400/50 bg-amber-400/10';
    case 'running':
      return 'text-sky-300 border-sky-400/50 bg-sky-400/10';
    case 'unreachable':
      return 'text-zinc-400 border-zinc-500/40 bg-zinc-500/10';
    case 'skipped':
      return 'text-zinc-400 border-zinc-500/40 bg-zinc-500/10';
    default:
      return 'text-emerald-400/50 border-emerald-400/20 bg-transparent';
  }
}

function StatusBadge({ status }: { status: DialogTestRunStatus }) {
  const label = status === 'idle' ? '—' : status.toUpperCase();
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border font-mono text-[10px] ${statusColor(status)}`}>
      {status === 'running' ? <Loader2 className="w-2.5 h-2.5 animate-spin mr-0.5" /> : null}
      {label}
    </span>
  );
}

function VoiceFamilyBadge({ states }: { states: Record<DialogTestFamily, DialogTestFamilyRunState> }) {
  return (
    <span className="flex items-center gap-1.5">
      {DIALOG_TEST_FAMILIES.map((family) => {
        const st = states[family].status;
        const color = st === 'pass'
          ? 'bg-emerald-400'
          : st === 'fail' || st === 'stuck'
            ? 'bg-red-400'
            : st === 'unreachable'
              ? 'bg-zinc-500'
              : 'bg-emerald-400/25';
        return (
          <span
            key={family}
            title={`${DIALOG_TEST_FAMILY_LABELS[family]}: ${st}`}
            className={`w-2 h-2 rounded-full ${color}`}
          />
        );
      })}
    </span>
  );
}

function ScriptColumn({
  family,
  voice,
  state,
  onRun,
  disabled,
  startQuestion,
}: {
  family: DialogTestFamily;
  voice: DialogTestVoice;
  state: DialogTestFamilyRunState;
  onRun: () => void;
  disabled: boolean;
  startQuestion?: string;
}) {
  const transcript = state.transcript ?? state.result?.transcript ?? [];
  const isRunning = state.status === 'running';
  const finalPath = state.finalPath ?? state.result?.finalPath ?? null;

  const script = voice.scripts[family];
  const plannedSteps = script.userSteps;
  const hasRun = transcript.length > 0 || isRunning || state.status === 'pass' || state.status === 'fail' || state.status === 'stuck';

  return (
    <div className="flex flex-col min-w-0 min-h-[200px] rounded border border-emerald-400/20 bg-[#0a120e] overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-2.5 py-2 border-b border-emerald-400/15 flex-shrink-0">
        <div className="min-w-0">
          <span className="block font-mono text-xs text-emerald-200/90">{DIALOG_TEST_FAMILY_LABELS[family]}</span>
          <span className="block font-mono text-[10px] text-emerald-400/45 truncate">{DIALOG_TEST_FAMILY_HINTS[family]}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <StatusBadge status={state.status} />
          <button
            type="button"
            disabled={disabled || plannedSteps.length === 0}
            onClick={onRun}
            className="p-1 rounded border border-emerald-400/30 text-emerald-300 hover:bg-emerald-400/10 disabled:opacity-40"
            title="Esegui script"
          >
            <Play className="w-3 h-3" />
          </button>
        </div>
      </div>
      <TestPlanChatTranscript
        startQuestion={startQuestion}
        transcript={transcript}
        plannedUserSteps={hasRun ? [] : plannedSteps}
        finalPath={finalPath}
        running={isRunning}
        emptyHint="Premi ▶ per avviare il dialogo."
      />
      {state.result?.reason && state.status !== 'pass' && (
        <p className="px-2.5 py-1.5 border-t border-red-400/20 font-mono text-[10px] text-red-300/90 flex-shrink-0">
          {state.result.reason}
        </p>
      )}
      {state.error && (
        <p className="px-2.5 py-1.5 border-t border-red-400/20 font-mono text-[10px] text-red-300/90 flex-shrink-0">
          {state.error}
        </p>
      )}
    </div>
  );
}

function VoiceAccordion({
  voice,
  states,
  onRunFamily,
  onAddManual,
  running,
  startQuestion,
}: {
  voice: DialogTestVoice;
  states: Record<DialogTestFamily, DialogTestFamilyRunState>;
  onRunFamily: (family: DialogTestFamily) => void;
  onAddManual: () => void;
  running: boolean;
  startQuestion?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-emerald-400/25 bg-[#0a0f0c] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-2 px-4 py-3 text-left hover:bg-emerald-400/5 transition-colors"
      >
        <ChevronDown
          className={`w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-400 transition-transform ${open ? '' : '-rotate-90'}`}
        />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <VoiceFamilyBadge states={states} />
            {!voice.catalogItemFound && (
              <span className="font-mono text-[10px] text-amber-300/90 border border-amber-400/30 px-1.5 rounded">
                voce assente dal catalogo
              </span>
            )}
          </div>
          <span className="block text-sm text-emerald-50 font-medium truncate">{voice.sourceText}</span>
          <span className="block text-xs font-mono text-emerald-400/50 truncate">{voice.targetPath}</span>
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-emerald-400/15 space-y-3">
          {!voice.catalogItemFound && (
            <p className="font-mono text-xs text-amber-200/80">
              Path non trovato nel catalogo compilato — script solo con frase naturale iniziale.
            </p>
          )}
          {voice.catalogItemFound && voice.canonicalTokens.length > 0 && (
            <p className="font-mono text-xs text-emerald-400/50">
              Percorso guidato ({voice.canonicalTokens.length}):
              {' '}
              {voice.canonicalTokens.join(' → ')}
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {DIALOG_TEST_FAMILIES.map((family) => (
              <ScriptColumn
                key={family}
                family={family}
                voice={voice}
                state={states[family]}
                onRun={() => onRunFamily(family)}
                disabled={running}
                startQuestion={startQuestion}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onAddManual}
              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-emerald-400/30 font-mono text-xs text-emerald-300 hover:bg-emerald-400/10"
            >
              <Circle className="w-3 h-3" />
              Aggiungi test manuale
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ToolbarButton({
  children,
  onClick,
  disabled,
  variant = 'default',
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'danger';
}) {
  const cls = variant === 'danger'
    ? 'border-red-400/40 text-red-200 hover:bg-red-400/10'
    : 'border-emerald-400/40 text-emerald-100 hover:bg-emerald-400/10';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded border font-mono text-sm transition-colors disabled:opacity-40 ${cls}`}
    >
      {children}
    </button>
  );
}

export function TestPlanWorkspace() {
  const { analysisApi } = useDocumentEditorController();
  const bundle = useTestAgentBundle();
  const segmentationRows = useTestPlanSegmentationRows();
  const {
    plan,
    running,
    summary,
    regenerate,
    runAll,
    runFailed,
    runFamily,
    cancelRun,
    addManualSession,
    getVoiceFamilyState,
  } = useDialogTestPlan(bundle, segmentationRows);

  const vbEnabled = shouldUseVbTestEngine(bundle);

  if (!analysisApi.hasTaxonomy) {
    return (
      <div className="flex items-center justify-center h-full text-emerald-400/30 font-mono text-sm px-8 text-center">
        Genera l&apos;ontologia prima di consultare il piano test.
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="flex items-center justify-center h-full text-emerald-400/30 font-mono text-sm px-8 text-center">
        Compila il bundle agente (dizionario + analisi) per generare i test.
      </div>
    );
  }

  if (!vbEnabled) {
    return (
      <div className="flex items-center justify-center h-full text-emerald-400/30 font-mono text-sm px-8 text-center">
        Motore VB disabilitato. Imposta VITE_VB_TEST_ENGINE ≠ false e avvia DialogEngine.Api.
      </div>
    );
  }

  const startQuestion = bundle.analysis.start_question?.trim()
    || bundle.ontology.start_question?.trim();

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden bg-[#0a0f0c]">
      <header className="flex-shrink-0 px-5 py-4 border-b border-emerald-400/25 bg-[#0d1812]">
        <div className="flex items-start gap-3">
          <TestTube2 className="w-6 h-6 text-emerald-300 flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1 space-y-2">
            <h2 className="font-mono text-base font-bold text-emerald-50 uppercase tracking-wide">
              Piano test dialogo
            </h2>
            <p className="font-mono text-sm text-emerald-200/80 leading-relaxed max-w-3xl">
              Minimi: un token catalogo per turno. 3/4 e One-shot: frase naturale («Vorrei prenotare…») con token raggruppati o tutti insieme.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <span className="inline-flex px-2 py-0.5 rounded border border-emerald-400/30 font-mono text-xs text-emerald-100">
                {plan?.voices.length ?? 0} voci
              </span>
              <span className="inline-flex px-2 py-0.5 rounded border border-emerald-400/30 font-mono text-xs text-emerald-100">
                {summary.passed} pass
              </span>
              <span className="inline-flex px-2 py-0.5 rounded border border-red-400/30 font-mono text-xs text-red-200">
                {summary.failed + summary.stuck} fail
              </span>
              <span className="inline-flex px-2 py-0.5 rounded border border-emerald-400/30 font-mono text-xs text-emerald-100/70">
                {summary.pending} da eseguire
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
            <ToolbarButton onClick={runAll} disabled={running || !plan?.voices.length}>
              <Play className="w-3.5 h-3.5" />
              Esegui tutti
            </ToolbarButton>
            <ToolbarButton onClick={runFailed} disabled={running || summary.failed + summary.stuck === 0}>
              <Play className="w-3.5 h-3.5" />
              Esegui falliti
            </ToolbarButton>
            {running && (
              <ToolbarButton onClick={cancelRun} variant="danger">
                <Square className="w-3.5 h-3.5" />
                Stop
              </ToolbarButton>
            )}
            <ToolbarButton onClick={regenerate} disabled={running}>
              <RefreshCw className="w-3.5 h-3.5" />
              Rigenera
            </ToolbarButton>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3">
        {plan?.voices.map((voice) => (
          <VoiceAccordion
            key={voice.id}
            voice={voice}
            states={getVoiceFamilyState(voice.id)}
            onRunFamily={(family) => { void runFamily(voice.id, family); }}
            onAddManual={() => addManualSession(voice.id)}
            running={running}
            startQuestion={startQuestion}
          />
        ))}
      </div>
    </div>
  );
}
