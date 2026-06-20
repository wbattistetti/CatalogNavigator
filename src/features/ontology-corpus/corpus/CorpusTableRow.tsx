/**
 * Single virtualized corpus table row.
 */
import type { TokenCategory } from '../../../lib/dictionaryTree';
import type { CorpusSegmentationEntry } from '../../../lib/corpusSegmentationCache';
import type { LoadedDictionaryRef } from '../../../lib/multiDictionarySegment';
import type { HighlightSpan } from '../../../lib/tokenDictionary';
import type { MatchPhrase } from '../../../lib/tokenDictionary';
import { CORPUS_ROW_GRID, CORPUS_ROW_HEIGHT_PX } from '../corpusLayout';
import { MemoCorpusHighlightedDescription } from './CorpusHighlightedDescription';
import { MemoCorpusSegmentationChips } from './CorpusSegmentationChips';

export function CorpusTableRow({
  rowIndex,
  text,
  matchPhrases,
  liveLoadedRefs,
  editingDictionaryId,
  categories,
  segmentation,
  segmentationPending,
  editableCanonicalSet,
  onRemoveSpan,
  onRemoveCanonical,
  onMouseDown,
  onDoubleClick,
  onMouseUp,
  onContextMenu,
}: {
  rowIndex: number;
  text: string;
  matchPhrases: MatchPhrase[];
  liveLoadedRefs: LoadedDictionaryRef[];
  editingDictionaryId: string | null;
  categories: TokenCategory[];
  segmentation?: CorpusSegmentationEntry;
  segmentationPending: boolean;
  editableCanonicalSet: ReadonlySet<string>;
  onRemoveSpan: (span: HighlightSpan) => void;
  onRemoveCanonical: (token: string) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onDoubleClick: (e: React.MouseEvent, sourceText: string) => void;
  onMouseUp: (e: React.MouseEvent, sourceText: string) => void;
  onContextMenu: (e: React.MouseEvent, sourceText: string) => void;
}) {
  return (
    <div
      className={`${CORPUS_ROW_GRID} items-start border-b border-[#111] hover:bg-[#0f1a12]`}
      style={{ minHeight: CORPUS_ROW_HEIGHT_PX }}
    >
      <span className="font-mono text-[9px] text-emerald-300/80 pt-2.5 text-center tabular-nums">
        R{rowIndex}
      </span>
      <div
        data-corpus-description-row
        className="min-w-0 px-3 py-2"
        onMouseDown={onMouseDown}
        onDoubleClick={(e) => onDoubleClick(e, text)}
        onMouseUp={(e) => onMouseUp(e, text)}
        onContextMenu={(e) => onContextMenu(e, text)}
      >
        <p className="font-mono text-xs select-text cursor-text">
          <MemoCorpusHighlightedDescription
            text={text}
            matchPhrases={matchPhrases}
            liveLoadedRefs={liveLoadedRefs}
            editingDictionaryId={editingDictionaryId}
            editingCategories={categories}
            onRemoveSpan={onRemoveSpan}
            editableCanonicalSet={editableCanonicalSet}
          />
        </p>
      </div>
      <div className="min-w-0 px-3 py-2 border-l border-[#1a3a2a]">
        <MemoCorpusSegmentationChips
          sourceText={text}
          liveLoadedRefs={liveLoadedRefs}
          editingDictionaryId={editingDictionaryId}
          editingCategories={categories}
          fallbackCategories={categories}
          segmentation={segmentation}
          pending={segmentationPending}
          editableCanonicalSet={editableCanonicalSet}
        />
      </div>
    </div>
  );
}
