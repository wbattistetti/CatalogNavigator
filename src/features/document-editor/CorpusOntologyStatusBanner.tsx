/**
 * Global banner when corpus segmentation is stale or dictionaries are still loading.
 */
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useDocumentEditorController } from './DocumentEditorContext';

export function CorpusOntologyStatusBanner() {
  const {
    showOntologyTab,
    corpusOntologyStatus,
    refreshOntology,
    canRefreshOntology,
    ontologyRefreshDisabledReason,
    analysisApi,
  } = useDocumentEditorController();

  if (!showOntologyTab) return null;

  const { phase, message } = corpusOntologyStatus;
  if (phase === 'ready') return null;

  const isLoading = phase === 'loading' || phase === 'stabilizing';
  const isStale = phase === 'stale';
  const refreshLabel = analysisApi.hasTaxonomy ? 'Ricrea ontologia' : 'Crea ontologia';

  return (
    <div
      className={`flex-shrink-0 px-3 py-2 border-b font-mono text-[11px] flex items-start gap-2 ${
        isStale
          ? 'border-amber-400/35 bg-amber-400/10 text-amber-100/95'
          : 'border-sky-400/25 bg-sky-400/8 text-sky-100/90'
      }`}
      role="status"
    >
      {isLoading
        ? <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0 mt-0.5" />
        : <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-300" />}
      <div className="min-w-0 flex-1 leading-relaxed">
        <p>{message}</p>
        {(isStale || phase === 'missing' || phase === 'partial') && (
          <p className="mt-1 text-emerald-300/75">
            <button
              type="button"
              onClick={() => refreshOntology()}
              disabled={!canRefreshOntology}
              title={ontologyRefreshDisabledReason ?? undefined}
              className="text-amber-200 hover:text-amber-50 underline underline-offset-2 disabled:opacity-40 disabled:no-underline"
            >
              {refreshLabel}
            </button>
            {phase === 'partial' ? ' per riprendere o ricominciare.' : ' per allineare corpus e dizionario.'}
          </p>
        )}
      </div>
    </div>
  );
}
