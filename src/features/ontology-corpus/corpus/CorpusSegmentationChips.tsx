/**
 * Segmentation chips for one corpus row.
 */
import { memo } from 'react';
import type { TokenCategory } from '../../../lib/dictionaryTree';
import type { CorpusSegmentationEntry } from '../../../lib/corpusSegmentationCache';
import type { LoadedDictionaryRef } from '../../../lib/multiDictionarySegment';
import { resolveChipAppearance } from '../../../lib/categoryIconCatalog';
import { useOntologyCorpusSegmentation } from '../OntologyCorpusSegmentationContext';
import { SelectableCorpusChip } from './SelectableCorpusChip';

function CorpusSegmentationChips({
  sourceText,
  liveLoadedRefs,
  editingDictionaryId,
  editingCategories,
  fallbackCategories,
  segmentation,
  pending = false,
  editableCanonicalSet,
}: {
  sourceText: string;
  liveLoadedRefs: LoadedDictionaryRef[];
  editingDictionaryId: string | null;
  editingCategories: TokenCategory[];
  fallbackCategories: TokenCategory[];
  segmentation?: CorpusSegmentationEntry;
  pending?: boolean;
  editableCanonicalSet: ReadonlySet<string>;
}) {
  const { removeSegment } = useOntologyCorpusSegmentation();
  const { segments, unmatched } = segmentation ?? { segments: [], unmatched: [] };

  if (pending && !segmentation) {
    return (
      <span className="font-mono text-[10px] text-emerald-400/35 italic animate-pulse">
        …
      </span>
    );
  }

  if (segments.length === 0 && unmatched.length === 0) {
    return (
      <span className="font-mono text-[10px] italic text-emerald-400/55">
        —
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1 min-w-0">
      {segments.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          {segments.map((seg, i) => {
            const categorizable = editableCanonicalSet.has(seg.text);
            const appearance = resolveChipAppearance(
              seg.text,
              liveLoadedRefs,
              editingDictionaryId,
              editingCategories.length > 0 ? editingCategories : fallbackCategories,
            );
            return (
              <span key={`${seg.text}-${i}`} className="inline-flex items-center">
                <SelectableCorpusChip
                  canonical={seg.text}
                  categorizable={categorizable}
                  label={seg.text}
                  iconKey={appearance.iconKey}
                  iconColor={appearance.iconColor}
                  categoryColor={appearance.categoryColor}
                  iconTitle={appearance.title}
                  dictScope={appearance.scope}
                  removeTitle="Rimuovi dalla segmentazione"
                  onRemove={() => removeSegment(sourceText, seg.text)}
                />
                {i < segments.length - 1 && (
                  <span className="text-emerald-400/60 font-mono text-xs mx-0.5">·</span>
                )}
              </span>
            );
          })}
        </div>
      ) : (
        <span className="font-mono text-[10px] italic text-amber-300/85">
          nessun token
        </span>
      )}
      {unmatched.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          <span className="font-mono text-[9px] text-amber-400/50 mr-0.5">unmatched</span>
          {unmatched.map((word, i) => (
            <span
              key={`${word}-${i}`}
              className="inline-flex px-1.5 py-0.5 rounded border border-amber-400/25 bg-amber-400/10 font-mono text-[10px] text-amber-200/80"
            >
              {word}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export const MemoCorpusSegmentationChips = memo(
  CorpusSegmentationChips,
  (prev, next) =>
    prev.sourceText === next.sourceText
    && prev.segmentation === next.segmentation
    && prev.pending === next.pending
    && prev.liveLoadedRefs === next.liveLoadedRefs
    && prev.editingDictionaryId === next.editingDictionaryId
    && prev.editingCategories === next.editingCategories
    && prev.fallbackCategories === next.fallbackCategories
    && prev.editableCanonicalSet === next.editableCanonicalSet,
);
