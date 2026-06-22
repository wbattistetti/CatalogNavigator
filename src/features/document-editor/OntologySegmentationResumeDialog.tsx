/**
 * Prompt when a partial corpus segmentation exists: resume or restart from zero.
 */
import { Loader2 } from 'lucide-react';

export interface OntologySegmentationResumeDialogProps {
  open: boolean;
  processed: number;
  total: number;
  starting?: boolean;
  onResume: () => void;
  onStartFresh: () => void;
  onDismiss: () => void;
}

export function OntologySegmentationResumeDialog({
  open,
  processed,
  total,
  starting = false,
  onResume,
  onStartFresh,
  onDismiss,
}: OntologySegmentationResumeDialogProps) {
  if (!open) return null;

  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4"
      onMouseDown={onDismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="segmentation-resume-title"
        className="w-full max-w-md rounded border border-[#1a3a2a] bg-[#0a1510] shadow-2xl p-5"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2
          id="segmentation-resume-title"
          className="font-mono text-sm text-emerald-200/95 mb-2"
        >
          Segmentazione in sospeso
        </h2>
        <p className="font-mono text-xs text-emerald-400/65 leading-relaxed mb-4">
          Hai una segmentazione parziale salvata (
          <span className="tabular-nums text-emerald-300/85">
            {processed.toLocaleString('it-IT')} / {total.toLocaleString('it-IT')}
          </span>
          {' '}testi unici, circa {pct}%).
          Vuoi riprendere da dove eri o ricominciare da zero?
        </p>
        <div className="flex flex-col sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={onDismiss}
            disabled={starting}
            className="px-3 py-1.5 font-mono text-xs text-emerald-400/60 border border-[#1a3a2a] rounded hover:text-emerald-300/90 hover:bg-[#111] transition-colors disabled:opacity-40"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={onStartFresh}
            disabled={starting}
            className="px-3 py-1.5 font-mono text-xs text-amber-200/90 border border-amber-400/40 rounded hover:bg-amber-400/10 transition-colors disabled:opacity-40"
          >
            Ripartire da zero
          </button>
          <button
            type="button"
            onClick={onResume}
            disabled={starting}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 font-mono text-xs text-white bg-sky-600 border border-sky-500 rounded hover:bg-sky-500 transition-colors disabled:opacity-40"
          >
            {starting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Riprendi dove eri
          </button>
        </div>
      </div>
    </div>
  );
}
