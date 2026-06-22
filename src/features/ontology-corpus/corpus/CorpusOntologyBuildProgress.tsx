/**
 * Inline progress UI for corpus segmentation (Ontologia tab).
 */
import { Loader2, X } from 'lucide-react';
import type { SegmentationCacheProgress } from '../../../hooks/usePersistedSegmentationCache';

function resolveProgressLabel(segmentationProgress: SegmentationCacheProgress): { title: string; subtitle: string | null } {
  if (segmentationProgress.phase === 'saving') {
    return {
      title: 'Salvataggio segmentazione…',
      subtitle: `${segmentationProgress.processed.toLocaleString('it-IT')} testi unici`,
    };
  }
  const { processed, total } = segmentationProgress;
  if (total > 0) {
    return {
      title: `Segmentazione corpus… ${processed.toLocaleString('it-IT')} / ${total.toLocaleString('it-IT')}`,
      subtitle: 'testi unici del corpus',
    };
  }
  return {
    title: 'Preparazione segmentazione corpus…',
    subtitle: null,
  };
}

function resolveProgressPercent(segmentationProgress: SegmentationCacheProgress): number {
  if (segmentationProgress.phase === 'saving') return 100;
  const { processed, total } = segmentationProgress;
  if (total > 0) return Math.max(2, (processed / total) * 100);
  return 2;
}

export function CorpusOntologyBuildProgress({
  segmentationProgress,
  onCancel,
}: {
  segmentationProgress: SegmentationCacheProgress;
  onCancel?: () => void;
}) {
  const pct = resolveProgressPercent(segmentationProgress);
  const { title, subtitle } = resolveProgressLabel(segmentationProgress);
  const showPct = segmentationProgress.phase === 'segmenting' && segmentationProgress.total > 0;

  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-10 max-w-md mx-auto text-center">
      <Loader2 className="w-8 h-8 animate-spin text-sky-400/70" aria-hidden />
      <div className="w-full space-y-2">
        <p className="font-mono text-sm text-emerald-300/85">{title}</p>
        {subtitle && (
          <p className="font-mono text-xs tabular-nums text-emerald-400/45">
            {showPct ? `${Math.round(pct)}% — ${subtitle}` : subtitle}
          </p>
        )}
        <div className="h-2 rounded-full bg-[#1a3a2a] overflow-hidden">
          <div
            className="h-full bg-sky-400 transition-[width] duration-150"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-red-400/40 text-red-300/90 hover:bg-red-400/10 font-mono text-xs transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          Interrompi e salva
        </button>
      )}
    </div>
  );
}
