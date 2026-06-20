/**
 * Global banner after "Ricrea ontologia" — success only; issues open the Report tab.
 */
import { CheckCircle2, X } from 'lucide-react';
import { useDocumentEditorController } from './DocumentEditorContext';
import { hasCatalogSanityIssues } from '../../lib/catalogSanity';

export function CatalogSanityStrip() {
  const {
    analysisApi,
    catalogSanityReport,
    ontologyRefreshSanityNotice,
    dismissOntologyRefreshSanityNotice,
  } = useDocumentEditorController();

  const hasTaxonomy = analysisApi.hasTaxonomy;
  const hasIssues = hasCatalogSanityIssues(catalogSanityReport);
  const showAfterRefresh = ontologyRefreshSanityNotice === 'ready';

  if (!hasTaxonomy || !showAfterRefresh || hasIssues) return null;

  return (
    <div className="flex-shrink-0 px-4 py-2 border-b border-emerald-400/25 bg-emerald-400/5 font-mono text-xs text-emerald-200/90">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-emerald-300/90" />
          <span>Ricreazione completata — nessun problema di integrità nel catalogo.</span>
        </div>
        <button
          type="button"
          onClick={dismissOntologyRefreshSanityNotice}
          className="p-0.5 rounded hover:bg-white/5 text-emerald-400/50 hover:text-emerald-300/80 transition-colors flex-shrink-0"
          title="Chiudi avviso"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
