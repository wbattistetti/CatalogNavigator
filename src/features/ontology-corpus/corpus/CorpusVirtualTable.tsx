/**
 * Virtual-scrolled corpus table body.
 */
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import type { TokenCategory } from '../../../lib/dictionaryTree';
import type { LoadedDictionaryRef } from '../../../lib/multiDictionarySegment';
import type { HighlightSpan, MatchPhrase } from '../../../lib/tokenDictionary';
import { useCorpusVirtualScroll } from '../../../hooks/useCorpusVirtualScroll';
import type { CorpusRow } from '../corpusRowModel';
import { CORPUS_ROW_HEIGHT_PX, CORPUS_TABLE_MIN_WIDTH } from '../corpusLayout';
import type { OntologyCorpusSegmentationValue } from '../OntologyCorpusSegmentationContext';
import { CorpusSelectionBanner } from './CorpusSelectionBanner';
import { CorpusTableHeader } from './CorpusTableHeader';
import { CorpusTableRow } from './CorpusTableRow';
import type { CorpusDescriptionFilter } from '../useCorpusDescriptionFilter';

export interface CorpusVirtualTableHandle {
  scrollToTop: () => void;
  visibleTexts: string[];
}

export const CorpusVirtualTable = forwardRef(function CorpusVirtualTable({
  rows,
  filter,
  filterActive,
  segmentation,
  matchPhrases,
  liveLoadedRefs,
  editingDictionaryId,
  categories,
  editableCanonicalSet,
  onRemoveSpan,
  onRemoveCanonical,
  onMouseDown,
  onDoubleClick,
  onMouseUp,
  onContextMenu,
  onClearSelectionClick,
  ontologyItemCount,
}: {
  rows: CorpusRow[];
  filter: CorpusDescriptionFilter;
  filterActive: boolean;
  ontologyItemCount: number;
  segmentation: OntologyCorpusSegmentationValue;
  matchPhrases: MatchPhrase[];
  liveLoadedRefs: LoadedDictionaryRef[];
  editingDictionaryId: string | null;
  categories: TokenCategory[];
  editableCanonicalSet: ReadonlySet<string>;
  onRemoveSpan: (span: HighlightSpan) => void;
  onRemoveCanonical: (token: string) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onDoubleClick: (e: React.MouseEvent, sourceText: string) => void;
  onMouseUp: (e: React.MouseEvent, sourceText: string) => void;
  onContextMenu: (e: React.MouseEvent, sourceText: string) => void;
  onClearSelectionClick: (e: React.MouseEvent) => void;
}, ref: React.ForwardedRef<CorpusVirtualTableHandle>) {
  const { setContainerRef, range, totalHeight } = useCorpusVirtualScroll(rows.length, CORPUS_ROW_HEIGHT_PX);
  const scrollElRef = useRef<HTMLDivElement | null>(null);

  const setScrollRef = useCallback((el: HTMLDivElement | null) => {
    scrollElRef.current = el;
    setContainerRef(el);
  }, [setContainerRef]);

  const visibleRows = useMemo(
    () => rows.slice(range.start, range.end),
    [rows, range.start, range.end],
  );

  const visibleTexts = useMemo(
    () => visibleRows.map((row) => row.text),
    [visibleRows],
  );

  useImperativeHandle(ref, () => ({
    scrollToTop: () => {
      scrollElRef.current?.scrollTo({ top: 0 });
    },
    visibleTexts,
  }), [visibleTexts]);

  const { progress, lookup } = segmentation;

  return (
    <div
      ref={setScrollRef}
      className="flex-1 min-h-0 h-0 min-w-0 w-full max-w-full overflow-auto overscroll-contain"
      onClick={onClearSelectionClick}
    >
      <div className={CORPUS_TABLE_MIN_WIDTH}>
        <CorpusTableHeader
          filter={filter}
          progress={progress}
          ontologyItemCount={ontologyItemCount}
        />
        <CorpusSelectionBanner />
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-center font-mono text-xs text-emerald-400/35">
            {filterActive
              ? 'Nessuna descrizione corrisponde al filtro.'
              : 'Nessuna descrizione.'}
          </div>
        ) : (
          <div style={{ height: totalHeight, position: 'relative' }}>
            <div
              style={{
                transform: `translateY(${range.offsetY}px)`,
                willChange: 'transform',
              }}
            >
              {visibleRows.map(({ rowIndex, text }) => {
                const entry = lookup(text);
                return (
                  <CorpusTableRow
                    key={rowIndex}
                    rowIndex={rowIndex}
                    text={text}
                    matchPhrases={matchPhrases}
                    liveLoadedRefs={liveLoadedRefs}
                    editingDictionaryId={editingDictionaryId}
                    categories={categories}
                    segmentation={entry}
                    segmentationPending={!progress.ready && entry === undefined}
                    editableCanonicalSet={editableCanonicalSet}
                    onRemoveSpan={onRemoveSpan}
                    onRemoveCanonical={onRemoveCanonical}
                    onMouseDown={onMouseDown}
                    onDoubleClick={onDoubleClick}
                    onMouseUp={onMouseUp}
                    onContextMenu={onContextMenu}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
