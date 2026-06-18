/**
 * Segmentation chips and design-time path for one corpus row.
 */
import { memo } from 'react';
import type { TokenCategory } from '../../../lib/dictionaryTree';
import type { CorpusSegmentationEntry } from '../../../lib/corpusSegmentationCache';
import type { LoadedDictionaryRef } from '../../../lib/multiDictionarySegment';
import { resolveChipAppearance } from '../../../lib/categoryIconCatalog';
import { SelectableCorpusChip } from './SelectableCorpusChip';

function CorpusSegmentationChips({
  liveLoadedRefs,
  editingDictionaryId,
  editingCategories,
  fallbackCategories,
  segmentation,
  pending = false,
  onRemoveCanonical,
  editableCanonicalSet,
}: {
  liveLoadedRefs: LoadedDictionaryRef[];
  editingDictionaryId: string | null;
  editingCategories: TokenCategory[];
  fallbackCategories: TokenCategory[];
  segmentation?: CorpusSegmentationEntry;
  pending?: boolean;
  onRemoveCanonical: (token: string) => void;
  editableCanonicalSet: ReadonlySet<string>;
}) {
  const { segments, unmatched } = segmentation ?? { segments: [], unmatched: [] };

  if (pending && !segmentation) {
    return (
      <span className="font-mono text-[10px] text-emerald-400/35 italic animate-pulse">
        …
      </span>
    );
  }

  if (segments.length === 0) {
    return (
      <span className={`font-mono text-[10px] italic ${
        unmatched.length > 0 ? 'text-amber-300/85' : 'text-emerald-400/55'
      }`}>
        {unmatched.length > 0 ? 'nessun token' : '—'}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1 min-w-0">
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
                onRemove={categorizable ? () => onRemoveCanonical(seg.text) : undefined}
              />
              {i < segments.length - 1 && (
                <span className="text-emerald-400/60 font-mono text-xs mx-0.5">·</span>
              )}
            </span>
          );
        })}
      </div>
      {segmentation?.path ? (
        <p
          className="font-mono text-[9px] text-sky-300/75 leading-snug break-all"
          title={segmentation.path}
        >
          <span className="text-sky-400/45 mr-1">path</span>
          {segmentation.path}
        </p>
      ) : null}
    </div>
  );
}

export const MemoCorpusSegmentationChips = memo(
  CorpusSegmentationChips,
  (prev, next) =>
    prev.segmentation === next.segmentation
    && prev.pending === next.pending
    && prev.liveLoadedRefs === next.liveLoadedRefs
    && prev.editingDictionaryId === next.editingDictionaryId
    && prev.editingCategories === next.editingCategories
    && prev.fallbackCategories === next.fallbackCategories
    && prev.onRemoveCanonical === next.onRemoveCanonical
    && prev.editableCanonicalSet === next.editableCanonicalSet,
);
