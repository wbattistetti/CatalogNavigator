/**
 * Progress bars for disambiguation plan compute (BFS) and IA message generation.
 */
import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import type { DisambiguationGenProgress } from '../../lib/analysisTypes';
import type { CompileDisambiguationPlanProgress } from '../../lib/compileDisambiguationPlan';
import {
  bfsPseudoProgressPercent,
  estimateRemainingMinutes,
  formatElapsedMs,
  formatRatePerMinute,
} from '../../lib/disambiguationProgressFormat';

export type DisambiguationComputePhase = 'preparing' | 'bfs' | 'finalizing';

function useProgressClock(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs]);
  return now;
}

function ProgressTrack({ percent, indeterminate = false }: { percent: number; indeterminate?: boolean }) {
  return (
    <div className="w-full h-2 rounded-full bg-[#1a3a2a] overflow-hidden">
      <div
        className={`h-full bg-sky-400 ${indeterminate ? 'animate-pulse w-full opacity-70' : 'transition-[width] duration-150'}`}
        style={indeterminate ? undefined : { width: `${Math.max(2, Math.min(100, percent))}%` }}
      />
    </div>
  );
}

/** Overlay while BFS explores disambiguation states ("Calcola"). */
export function DisambiguationComputeProgressOverlay({
  phase,
  progress,
  preparingDetail,
  preparingPercent,
  onCancel,
}: {
  phase: DisambiguationComputePhase;
  progress: CompileDisambiguationPlanProgress | null;
  preparingDetail?: string;
  preparingPercent?: number;
  onCancel?: () => void;
}) {
  if (phase === 'preparing') {
    const pct = preparingPercent != null && preparingPercent > 0 ? preparingPercent : 4;
    return (
      <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0a0f0c]/75 backdrop-blur-[1px]">
        <div className="flex flex-col items-center gap-4 rounded-lg border border-emerald-400/30 bg-[#0a1510] px-8 py-6 shadow-lg max-w-lg w-full mx-4">
          <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
          <div className="w-full space-y-2 text-center">
            <p className="font-mono text-sm font-semibold text-emerald-200">
              Preparazione catalogo…
            </p>
            <p className="font-mono text-xs text-emerald-400/55">
              {preparingDetail ?? 'Caricamento prestazioni senza ricalcolare la segmentazione del corpus'}
            </p>
            <ProgressTrack percent={pct} />
          </div>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-red-400/35 text-red-300/90 font-mono text-xs hover:bg-red-400/10"
            >
              <X className="w-3.5 h-3.5" />
              Annulla
            </button>
          )}
        </div>
      </div>
    );
  }

  if (phase === 'finalizing') {
    return (
      <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0a0f0c]/75 backdrop-blur-[1px]">
        <div className="flex flex-col items-center gap-4 rounded-lg border border-emerald-400/30 bg-[#0a1510] px-8 py-6 shadow-lg max-w-lg w-full mx-4">
          <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
          <div className="w-full space-y-2 text-center">
            <p className="font-mono text-sm font-semibold text-emerald-200">
              Finalizzazione piano…
            </p>
            <p className="font-mono text-xs text-emerald-400/55">
              Costruzione editor messaggi — il browser resta responsivo
            </p>
            <ProgressTrack percent={50} indeterminate />
          </div>
        </div>
      </div>
    );
  }

  if (!progress) return null;

  const pct = bfsPseudoProgressPercent(progress.visitedStates, progress.queueLength);
  const speedLabel = formatRatePerMinute(progress.statesPerSecond * 60, 'stati');

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0a0f0c]/75 backdrop-blur-[1px]">
      <div className="flex flex-col items-center gap-4 rounded-lg border border-emerald-400/30 bg-[#0a1510] px-8 py-6 shadow-lg max-w-lg w-full mx-4">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
        <div className="w-full space-y-2 text-center">
          <p className="font-mono text-sm font-semibold text-emerald-200">
            Ispezione stati disambiguazione…
          </p>
          <p className="font-mono text-xs tabular-nums text-emerald-300/80">
            {progress.visitedStates.toLocaleString('it-IT')} stati esplorati
            {' · '}
            coda {progress.queueLength.toLocaleString('it-IT')}
            {' · '}
            {progress.decisionNodes.toLocaleString('it-IT')} messaggi trovati
          </p>
          <p className="font-mono text-xs tabular-nums text-emerald-400/50">
            Catalogo {progress.catalogItemCount.toLocaleString('it-IT')} voci
            {' · '}
            {speedLabel}
            {' · '}
            {formatElapsedMs(progress.elapsedMs)}
          </p>
          <ProgressTrack percent={pct} />
          <p className="font-mono text-[11px] text-emerald-400/40">
            Avanzamento stimato — il totale stati si conosce solo a fine calcolo
          </p>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-red-400/35 text-red-300/90 font-mono text-xs hover:bg-red-400/10"
          >
            <X className="w-3.5 h-3.5" />
            Annulla
          </button>
        )}
      </div>
    </div>
  );
}

/** Shell strip while OpenAI generates disambiguation copy. */
export function DisambiguationAiGenerationProgressBar({
  progress,
}: {
  progress: DisambiguationGenProgress;
}) {
  const now = useProgressClock(true);
  const { processedMessages, totalMessages, processedChunks, totalChunks, startedAt } = progress;
  const pct = totalMessages > 0 ? (processedMessages / totalMessages) * 100 : 2;
  const elapsedMs = now - startedAt;
  const messagesPerMin = elapsedMs > 0
    ? (processedMessages / elapsedMs) * 60_000
    : 0;
  const etaMin = estimateRemainingMinutes(processedMessages, totalMessages, elapsedMs);

  const label = totalMessages > 0
    ? `Generazione messaggi IA… ${processedMessages.toLocaleString('it-IT')} / ${totalMessages.toLocaleString('it-IT')}`
    : 'Preparazione generazione messaggi IA…';

  const detail = totalMessages > 0
    ? `Chunk ${processedChunks} / ${totalChunks} · ${formatRatePerMinute(messagesPerMin, 'messaggi')}${etaMin != null ? ` · ~${Math.ceil(etaMin)} min rimanenti` : ''}`
    : null;

  return (
    <div className="flex-shrink-0 px-4 py-2 border-b border-[#1a3a2a] bg-[#0a1510] z-20 shadow-[0_4px_12px_rgba(0,0,0,0.35)]">
      <div className="flex items-center justify-between gap-3 mb-1.5 font-mono text-sm text-emerald-400/70">
        <span className="flex items-center gap-2 min-w-0">
          <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
          <span className="truncate">{label}</span>
        </span>
        {totalMessages > 0 && (
          <span className="tabular-nums text-emerald-300/80 flex-shrink-0">
            {Math.round(pct)}%
          </span>
        )}
      </div>
      {detail && (
        <p className="font-mono text-xs tabular-nums text-emerald-400/45 mb-1.5">{detail}</p>
      )}
      <ProgressTrack percent={pct} />
    </div>
  );
}
