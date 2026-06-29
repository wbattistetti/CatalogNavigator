/**
 * Portaled hit layer for corpus description cells — canvas-matching runs at 12px.
 */
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { GlideDescCellData, GlideDescRun } from '../../../lib/glideDescriptionRenderer';
import { GLIDE_WRAP_PILL_GAP } from '../../../lib/glideWrapLayout';
import { TABULAR_GLIDE_THEME } from '../../../components/DocumentViewer/tabularGlideTheme';
import { useCorpusGlideOverlay } from './CorpusGlideOverlayContext';
import type { GlideCellScreenRect } from './resolveGlideCellScreenRect';
import {
  useDictionaryChipDragging,
  useDictionaryChipSelected,
} from '../../../features/document-editor/dictionarySelectionStore';
import { useCorpusChipActions } from '../../../components/DocumentViewer/CorpusChipActionsContext';
import type { GlideChipPaint } from '../../../lib/glideChipRenderer';

const CELL_H_PAD = TABULAR_GLIDE_THEME.cellHorizontalPadding ?? 8;
const CELL_V_PAD = TABULAR_GLIDE_THEME.cellVerticalPadding ?? 2;
const TEXT_COLOR = TABULAR_GLIDE_THEME.textDark ?? '#d1fae5';

function resolvePortalRoot(): HTMLElement {
  return document.getElementById('portal') ?? document.body;
}

function GlideDescriptionHitChip({
  paint,
  canonical,
  categorizable,
}: {
  paint: GlideChipPaint;
  canonical: string;
  categorizable: boolean;
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
      className={`pointer-events-auto inline-flex max-w-full items-center rounded-[6px] border font-mono text-[12px] leading-none whitespace-nowrap ${selectionClass}`}
      style={{
        backgroundColor: paint.bgColor,
        borderColor: paint.borderColor,
        color: paint.fgColor,
        height: 18,
        paddingLeft: 6,
        paddingRight: 6,
      }}
      title={canonical}
    >
      <span className="truncate">{paint.text}</span>
    </span>
  );
}

function DescriptionRunSpan({ run }: { run: GlideDescRun }) {
  if (run.kind === 'text') {
    if (!run.text) return null;
    return (
      <span
        className="font-mono text-[12px] whitespace-pre-wrap break-words select-text"
        style={{ color: TEXT_COLOR, lineHeight: '20px' }}
      >
        {run.text}
      </span>
    );
  }

  return null;
}

export function CorpusGlideDescriptionHitLayer({
  descData,
  anchor,
  onClose,
}: {
  descData: GlideDescCellData;
  anchor: GlideCellScreenRect;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const overlay = useCorpusGlideOverlay();
  const sourceText = descData.sourceText;

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

  const runs = descData.runs.length > 0
    ? descData.runs
    : (sourceText.length > 0 ? [{ kind: 'text' as const, text: sourceText }] : []);

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[9998] box-border overflow-hidden pointer-events-auto select-text"
      style={{
        top: anchor.y,
        left: anchor.x,
        width: anchor.width,
        height: anchor.height,
        padding: `${CELL_V_PAD}px ${CELL_H_PAD}px`,
        backgroundColor: TABULAR_GLIDE_THEME.bgCell ?? '#0d0d0d',
      }}
      onMouseDown={(e) => {
        overlay.onMouseDown(e);
        e.stopPropagation();
      }}
      onDoubleClick={(e) => overlay.onDoubleClick(e, sourceText)}
      onMouseUp={(e) => overlay.onMouseUp(e, sourceText)}
      onContextMenu={(e) => overlay.onContextMenu(e, sourceText)}
    >
      <div
        className="min-w-0 flex flex-wrap items-center"
        style={{ gap: GLIDE_WRAP_PILL_GAP, rowGap: 0, lineHeight: '20px' }}
      >
        {runs.map((run, i) => {
          if (run.kind === 'text') {
            return <DescriptionRunSpan key={`text-${i}`} run={run} />;
          }
          const categorizable = overlay.editableCanonicalSet.has(run.text);
          return (
            <GlideDescriptionHitChip
              key={`chip-${run.text}-${i}`}
              paint={run.paint}
              canonical={run.text}
              categorizable={categorizable}
            />
          );
        })}
      </div>
    </div>,
    resolvePortalRoot(),
  );
}
