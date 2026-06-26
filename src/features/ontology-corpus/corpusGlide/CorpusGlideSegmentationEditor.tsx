/**
 * Overlay editor for corpus segmentation column (interactive chips).
 */
import {
  GridCellKind,
  type CustomCell,
  type GridCell,
  type ProvideEditorComponent,
} from '@glideapps/glide-data-grid';
import { isGlideChipCell, type GlideChipCellData } from '../../../lib/glideChipRenderer';
import { MemoCorpusSegmentationChips } from '../corpus/CorpusSegmentationChips';
import { useOntologyCorpusSegmentation } from '../OntologyCorpusSegmentationContext';
import { useCorpusGlideOverlay } from './CorpusGlideOverlayContext';

function CorpusGlideSegmentationEditorInner({
  value,
  onFinishedEditing,
}: {
  value: CustomCell<GlideChipCellData>;
  onFinishedEditing: (newValue?: GridCell) => void;
}) {
  const overlay = useCorpusGlideOverlay();
  const { lookup } = useOntologyCorpusSegmentation();
  const sourceText = value.data.sourceText;
  const segmentation = lookup(sourceText);

  return (
    <div
      className="min-w-[280px] max-w-[min(520px,90vw)] rounded border border-[#1a3a2a] bg-[#0a1510] p-3 shadow-xl"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <p className="mb-2 font-mono text-[10px] text-emerald-400/50 line-clamp-2" title={sourceText}>
        {sourceText}
      </p>
      <MemoCorpusSegmentationChips
        sourceText={sourceText}
        liveLoadedRefs={overlay.liveLoadedRefs}
        editingDictionaryId={overlay.editingDictionaryId}
        editingCategories={overlay.categories}
        fallbackCategories={overlay.categories}
        segmentation={segmentation}
        editableCanonicalSet={overlay.editableCanonicalSet}
      />
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => onFinishedEditing(value)}
          className="px-2 py-1 rounded border border-emerald-400/35 font-mono text-[10px] text-emerald-300 hover:bg-emerald-400/10"
        >
          Chiudi
        </button>
      </div>
    </div>
  );
}

export const CorpusGlideSegmentationEditor: ProvideEditorComponent<GridCell> = ({
  value,
  onFinishedEditing,
}) => {
  if (value.kind !== GridCellKind.Custom || !isGlideChipCell(value as CustomCell)) {
    return null;
  }
  return (
    <CorpusGlideSegmentationEditorInner
      value={value as CustomCell<GlideChipCellData>}
      onFinishedEditing={onFinishedEditing}
    />
  );
};
