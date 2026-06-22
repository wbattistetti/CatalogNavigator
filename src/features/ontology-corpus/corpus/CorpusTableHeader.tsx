/**
 * Sticky table header with description filter and segmentation progress.
 */
import type { SegmentationCacheProgress } from '../../../hooks/usePersistedSegmentationCache';
import { CORPUS_ROW_GRID } from '../corpusLayout';
import { CorpusDescriptionFilterInput } from './CorpusDescriptionFilterInput';
import type { CorpusDescriptionFilter } from '../useCorpusDescriptionFilter';

export function CorpusTableHeader({
  filter,
  progress,
  ontologyItemCount,
  loadingPersisted = false,
  building = false,
  stale = false,
}: {
  filter: CorpusDescriptionFilter;
  progress: SegmentationCacheProgress;
  /** Saved ontology leaf paths (`analysis.item_paths`). */
  ontologyItemCount: number;
  loadingPersisted?: boolean;
  building?: boolean;
  stale?: boolean;
}) {
  return (
    <>
      <div
        className={`sticky top-0 z-10 ${CORPUS_ROW_GRID} items-start border-b border-[#1a3a2a] bg-[#0a1510]`}
      >
        <span className="flex-shrink-0 px-1 py-1.5 font-mono text-[9px] text-emerald-400/70 uppercase tracking-wider text-center">
          #
        </span>
        <div className="min-w-0 px-3 py-1.5 flex flex-col gap-1.5">
          <span className="font-mono text-[10px] text-emerald-300/85 uppercase tracking-wider">
            Descrizioni
          </span>
          <CorpusDescriptionFilterInput filter={filter} />
        </div>
        <div className="min-w-0 px-3 py-1.5 border-l border-[#1a3a2a] font-mono text-[10px] text-amber-300/85 uppercase tracking-wider">
          Segmentazione
          <span className="ml-1.5 tabular-nums text-amber-200/95 normal-case">
            ({ontologyItemCount.toLocaleString('it-IT')})
          </span>
          {loadingPersisted && (
            <span className="ml-2 normal-case text-emerald-400/45">
              caricamento…
            </span>
          )}
          {!loadingPersisted && building && progress.total > 0 && (
            <span className="ml-2 normal-case text-emerald-400/45 tabular-nums">
              {progress.processed.toLocaleString('it-IT')}/{progress.total.toLocaleString('it-IT')}
            </span>
          )}
          {!loadingPersisted && !building && stale && (
            <span className="ml-2 normal-case text-amber-300/55">
              obsoleta
            </span>
          )}
        </div>
      </div>
      {!loadingPersisted && building && progress.total > 0 && (
        <div className="h-0.5 bg-[#1a3a2a]">
          <div
            className="h-full bg-sky-400/50 transition-[width] duration-150"
            style={{ width: `${Math.min(100, (progress.processed / progress.total) * 100)}%` }}
          />
        </div>
      )}
    </>
  );
}
