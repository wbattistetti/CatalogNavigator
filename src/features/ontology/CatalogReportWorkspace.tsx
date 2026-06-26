/**
 * Full-page catalog integrity report with exclusion actions.
 */
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { CatalogSanityPanel } from '../agent/CatalogSanityPanel';
import { useDocumentEditorController } from '../document-editor/DocumentEditorContext';
import type { CatalogSanityReport } from '../../lib/catalogSanity';
import { hasCatalogSanityIssues } from '../../lib/catalogSanity';

function countOpenIssues(
  report: CatalogSanityReport,
  itemExclusions: Set<string>,
): number {
  let open = 0;
  for (const group of report.duplicates) {
    const active = group.items.filter((i) => !itemExclusions.has(i.sourceText.trim()));
    if (active.length > 1) open += 1;
  }
  for (const row of report.repeatedTokens) {
    if (!itemExclusions.has(row.sourceText.trim())) open += 1;
  }
  for (const row of report.cardinalityViolations ?? []) {
    if (!itemExclusions.has(row.sourceText.trim())) open += 1;
  }
  return open;
}

export function CatalogReportWorkspace() {
  const {
    catalogSanityReport,
    corpusItemExclusions,
    excludeCorpusItem,
    restoreCorpusItem,
    removeCorpusSegment,
    excludeCorpusSegmentOccurrence,
    analysisApi,
  } = useDocumentEditorController();

  if (!analysisApi.hasTaxonomy) {
    return (
      <div className="flex items-center justify-center h-full text-emerald-400/30 font-mono text-sm px-8 text-center">
        Genera l&apos;ontologia prima di consultare il report integrità.
      </div>
    );
  }

  if (!catalogSanityReport || !hasCatalogSanityIssues(catalogSanityReport)) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-8 text-center">
        <CheckCircle2 className="w-10 h-10 text-emerald-400/60" />
        <p className="font-mono text-sm text-emerald-200/80 max-w-md">
          Nessun problema di integrità nel catalogo. Item duplicati e token ripetuti assenti.
        </p>
      </div>
    );
  }

  const openIssues = countOpenIssues(catalogSanityReport, corpusItemExclusions);
  const duplicateGroups = catalogSanityReport.duplicates.length;
  const repeatedRows = catalogSanityReport.repeatedTokens.length;
  const cardinalityRows = catalogSanityReport.cardinalityViolations?.length ?? 0;

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden bg-[#0a0f0c]">
      <header className="flex-shrink-0 px-5 py-4 border-b border-amber-400/30 bg-amber-950/40">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-amber-300 flex-shrink-0 mt-0.5" />
          <div className="min-w-0 space-y-2">
            <h2 className="font-mono text-base font-bold text-amber-50 uppercase tracking-wide">
              Report integrità catalogo
            </h2>
            <p className="font-mono text-sm text-amber-100 leading-relaxed max-w-3xl">
              {openIssues > 0
                ? `${openIssues} intervento/i ancora necessario/i. Escludi gli item o i segmenti indicati `
                  + 'per rendere distinguibili le voci del catalogo prima di pubblicare l\'agente.'
                : 'Tutti i problemi segnalati sono stati esclusi. Ricrea l\'ontologia per verificare che il catalogo sia pulito.'}
            </p>
            <div className="flex flex-wrap gap-2 pt-0.5">
              <span className="inline-flex items-center px-2.5 py-1 rounded border border-amber-400/40 font-mono text-sm text-amber-50 bg-amber-400/10">
                {duplicateGroups} gruppo/i duplicati
              </span>
              <span className="inline-flex items-center px-2.5 py-1 rounded border border-amber-400/40 font-mono text-sm text-amber-50 bg-amber-400/10">
                {repeatedRows} token ripetuti
              </span>
              {cardinalityRows > 0 && (
                <span className="inline-flex items-center px-2.5 py-1 rounded border border-amber-400/40 font-mono text-sm text-amber-50 bg-amber-400/10">
                  {cardinalityRows} cardinalità
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-auto">
        <CatalogSanityPanel
          variant="page"
          report={catalogSanityReport}
          itemExclusions={corpusItemExclusions}
          onExcludeItem={excludeCorpusItem}
          onRestoreItem={restoreCorpusItem}
          onExcludeAllSegments={removeCorpusSegment}
          onExcludeSegmentOccurrence={excludeCorpusSegmentOccurrence}
        />
      </div>

      <footer className="flex-shrink-0 px-5 py-3 border-t border-[#1a3a2a] bg-[#0a1510] font-mono text-sm text-emerald-300/90">
        Le esclusioni valgono per questa sessione. Dopo ogni modifica, usa «Ricrea ontologia» per ricalcolare i path.
      </footer>
    </div>
  );
}
