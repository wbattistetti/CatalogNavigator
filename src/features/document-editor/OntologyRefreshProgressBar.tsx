/**
 * Progress bar for batched "Ricrea ontologia" corpus segmentation.
 */
import { Loader2, X } from 'lucide-react';
import { useDocumentEditorController } from './DocumentEditorContext';

export function OntologyRefreshProgressBar() {
  const { ontologyRefreshProgress, refreshingOntology, cancelOntologyRefresh } = useDocumentEditorController();

  if (!refreshingOntology || !ontologyRefreshProgress) return null;

  const { current, total, phase } = ontologyRefreshProgress;
  const pct = total > 0 ? Math.max(4, (current / total) * 100) : 4;
  const label = phase === 'building'
    ? 'Costruzione albero ontologia…'
    : `Segmentazione corpus… ${current.toLocaleString('it-IT')} / ${total.toLocaleString('it-IT')}`;

  return (
    <div className="flex-shrink-0 px-4 py-2 border-b border-[#1a3a2a] bg-[#0a1510]">
      <div className="flex items-center justify-between gap-3 mb-1.5 font-mono text-sm text-emerald-400/70">
        <span className="flex items-center gap-2 min-w-0">
          <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
          <span className="truncate">{label}</span>
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          {phase === 'segmentation' && total > 0 && (
            <span className="tabular-nums text-emerald-300/80">
              {Math.round(pct)}%
            </span>
          )}
          <button
            type="button"
            onClick={cancelOntologyRefresh}
            className="flex items-center gap-1 px-2 py-0.5 rounded border border-red-400/40 text-red-300/90 hover:bg-red-400/10 text-xs font-mono transition-colors"
            title="Interrompi la ricreazione ontologia"
          >
            <X className="w-3 h-3" />
            Annulla
          </button>
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-[#1a3a2a] overflow-hidden">
        <div
          className="h-full bg-sky-400 transition-all duration-200"
          style={{ width: `${phase === 'building' ? 100 : pct}%` }}
        />
      </div>
    </div>
  );
}
