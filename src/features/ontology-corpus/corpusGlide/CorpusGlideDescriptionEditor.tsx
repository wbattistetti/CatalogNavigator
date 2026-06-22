/**
 * Overlay editor for corpus description column (full interactive chips).
 */
import {
  GridCellKind,
  type CustomCell,
  type GridCell,
  type ProvideEditorComponent,
} from '@glideapps/glide-data-grid';
import { isGlideDescCell } from '../../../lib/glideDescriptionRenderer';
import type { GlideDescCellData } from '../../../lib/glideDescriptionRenderer';
import { MemoCorpusHighlightedDescription } from '../corpus/CorpusHighlightedDescription';
import { useCorpusGlideOverlay } from './CorpusGlideOverlayContext';

function CorpusGlideDescriptionEditorInner({
  value,
  onFinishedEditing,
}: {
  value: CustomCell<GlideDescCellData>;
  onFinishedEditing: (newValue?: GridCell) => void;
}) {
  const overlay = useCorpusGlideOverlay();
  const sourceText = value.data.sourceText;

  return (
    <div
      className="min-w-[280px] max-w-[640px] rounded border border-[#1a3a2a] bg-[#0a1510] p-3 shadow-xl"
      onMouseDown={(e) => {
        overlay.onMouseDown(e);
        e.stopPropagation();
      }}
      onDoubleClick={(e) => overlay.onDoubleClick(e, sourceText)}
      onMouseUp={(e) => overlay.onMouseUp(e, sourceText)}
      onContextMenu={(e) => overlay.onContextMenu(e, sourceText)}
    >
      <MemoCorpusHighlightedDescription
        text={sourceText}
        matchPhrases={overlay.matchPhrases}
        liveLoadedRefs={overlay.liveLoadedRefs}
        editingDictionaryId={overlay.editingDictionaryId}
        editingCategories={overlay.categories}
        onRemoveSpan={overlay.onRemoveSpan}
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

export const CorpusGlideDescriptionEditor: ProvideEditorComponent<GridCell> = ({
  value,
  onFinishedEditing,
}) => {
  if (value.kind !== GridCellKind.Custom || !isGlideDescCell(value as CustomCell)) {
    return null;
  }
  return (
    <CorpusGlideDescriptionEditorInner
      value={value as CustomCell<GlideDescCellData>}
      onFinishedEditing={onFinishedEditing}
    />
  );
};
