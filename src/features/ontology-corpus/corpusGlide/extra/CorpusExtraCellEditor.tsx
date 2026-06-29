/**
 * Portaled editor for a single corpus extra cell — chip removal via X (double-click to open).
 */
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { GlideChipCellData, GlideChipPaint } from '../../../../lib/glideChipRenderer';
import { GLIDE_WRAP_PILL_GAP } from '../../../../lib/glideWrapLayout';
import { TABULAR_GLIDE_THEME } from '../../../../components/DocumentViewer/tabularGlideTheme';
import { useOntologyCorpusExtra } from '../../OntologyCorpusExtraContext';
import { useCorpusGlideOverlay } from '../CorpusGlideOverlayContext';
import type { GlideCellScreenRect } from '../resolveGlideCellScreenRect';
import {
  useDictionaryChipDragging,
  useDictionaryChipSelected,
} from '../../../document-editor/dictionarySelectionStore';
import { useCorpusChipActions } from '../../../../components/DocumentViewer/CorpusChipActionsContext';

const CELL_H_PAD = TABULAR_GLIDE_THEME.cellHorizontalPadding ?? 8;
const CELL_V_PAD = TABULAR_GLIDE_THEME.cellVerticalPadding ?? 2;

function resolvePortalRoot(): HTMLElement {
  return document.getElementById('portal') ?? document.body;
}

function ExtraEditorChip({
  paint,
  canonical,
  categorizable,
  onRemove,
}: {
  paint: GlideChipPaint;
  canonical: string;
  categorizable: boolean;
  onRemove: () => void;
}) {
  const selected = useDictionaryChipSelected(canonical);
  const dragging = useDictionaryChipDragging(canonical);
  const { onChipClick, onChipMouseDown } = useCorpusChipActions();

  const selectionClass = categorizable && selected
    ? dragging
      ? 'border-2 border-emerald-300 opacity-90 cursor-grabbing'
      : 'border-2 border-emerald-400 cursor-grab'
    : categorizable
      ? 'cursor-text'
      : '';

  return (
    <span
      role={categorizable ? 'option' : undefined}
      aria-selected={categorizable ? selected : undefined}
      data-corpus-chip={categorizable ? 'true' : undefined}
      onClick={categorizable ? (e) => onChipClick(e, canonical) : undefined}
      onMouseDown={categorizable ? (e) => onChipMouseDown(e, canonical) : undefined}
      className={`group/chip pointer-events-auto inline-flex max-w-full items-center gap-0.5 rounded-[6px] border font-mono text-[12px] leading-none whitespace-nowrap ${selectionClass}`}
      style={{
        backgroundColor: paint.bgColor,
        borderColor: paint.borderColor,
        color: paint.fgColor,
        height: 20,
        paddingLeft: 6,
        paddingRight: 4,
      }}
      title={canonical}
    >
      <span className="truncate">{paint.text}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        title="Rimuovi da extra"
        className="flex-shrink-0 rounded p-0.5 opacity-0 transition-opacity group-hover/chip:opacity-100 text-red-400/70 hover:text-red-300 hover:bg-red-400/15"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}

export function CorpusExtraCellEditor({
  rowIndex,
  chipData,
  anchor,
  onClose,
}: {
  rowIndex: number;
  chipData: GlideChipCellData;
  anchor: GlideCellScreenRect;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const overlay = useCorpusGlideOverlay();
  const { removeExtraTokenAt } = useOntologyCorpusExtra();
  const paints = chipData.segments;

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[9998] box-border overflow-hidden pointer-events-auto"
      style={{
        top: anchor.y,
        left: anchor.x,
        width: anchor.width,
        height: anchor.height,
        padding: `${CELL_V_PAD}px ${CELL_H_PAD}px`,
        backgroundColor: TABULAR_GLIDE_THEME.bgCell ?? '#0d0d0d',
      }}
    >
      {paints.length === 0 ? (
        <span
          className="font-mono text-[12px] italic"
          style={{ color: TABULAR_GLIDE_THEME.textLight, lineHeight: '20px' }}
        >
          —
        </span>
      ) : (
        <div
          className="flex min-w-0 flex-wrap items-center"
          style={{ gap: GLIDE_WRAP_PILL_GAP, rowGap: 0, lineHeight: '20px' }}
        >
          {paints.map((paint, i) => {
            const canonical = paint.text;
            const categorizable = overlay.editableCanonicalSet.has(canonical);
            return (
              <ExtraEditorChip
                key={`${canonical}-${i}`}
                paint={paint}
                canonical={canonical}
                categorizable={categorizable}
                onRemove={() => removeExtraTokenAt(rowIndex, canonical, i)}
              />
            );
          })}
        </div>
      )}
    </div>,
    resolvePortalRoot(),
  );
}
