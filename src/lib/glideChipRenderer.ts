/**
 * Shared Glide custom cell renderer for colored chip pills (canvas, no React during scroll).
 */
import {
  GridCellKind,
  getMiddleCenterBias,
  measureTextCached,
  roundedRect,
  type CustomCell,
  type CustomRenderer,
} from '@glideapps/glide-data-grid';
import {
  GLIDE_WRAP_LINE_HEIGHT,
  GLIDE_WRAP_PILL_HEIGHT,
  GLIDE_WRAP_PILL_PAD_X,
  GLIDE_WRAP_PILL_GAP,
  layoutChipPills,
  lineTextBaselineY,
  pillTextBaselineY,
  pillTopY,
} from './glideWrapLayout';

export const GLIDE_CHIP_CELL = 'glide-chip' as const;

export interface GlideChipPaint {
  text: string;
  bgColor: string;
  borderColor: string;
  fgColor: string;
}

export interface GlideChipCellData {
  type: typeof GLIDE_CHIP_CELL;
  sourceText: string;
  segments: GlideChipPaint[];
  unmatched: string[];
}

const PILL_HEIGHT = GLIDE_WRAP_PILL_HEIGHT;
const PILL_PAD_X = GLIDE_WRAP_PILL_PAD_X;
const PILL_GAP = GLIDE_WRAP_PILL_GAP;

export function isGlideChipCell(
  cell: CustomCell,
): cell is CustomCell<GlideChipCellData> {
  return cell.kind === GridCellKind.Custom
    && (cell.data as GlideChipCellData | undefined)?.type === GLIDE_CHIP_CELL;
}

export function drawGlideChipPills(
  args: Parameters<CustomRenderer<CustomCell<GlideChipCellData>>['draw']>[0],
  data: GlideChipCellData,
): void {
  const { ctx, rect, theme } = args;
  const { x, y, width: w } = rect;
  const padX = theme.cellHorizontalPadding;
  const startX = x + padX;
  const startY = y + theme.cellVerticalPadding;
  const maxWidth = w - padX * 2;

  if (data.segments.length === 0 && data.unmatched.length === 0) {
    ctx.fillStyle = theme.textLight;
    ctx.font = theme.baseFontFull;
    ctx.fillText('—', startX, lineTextBaselineY(startY, ctx, theme));
    return;
  }

  ctx.font = theme.baseFontFull;
  const measure = (text: string) => measureTextCached(text, ctx, theme.baseFontFull).width;
  const { pills, unmatchedX, unmatchedY } = layoutChipPills(
    data.segments,
    startX,
    startY,
    maxWidth,
    measure,
  );

  for (const pill of pills) {
    const pillY = pillTopY(pill.y);
    ctx.beginPath();
    roundedRect(ctx, pill.x, pillY, pill.width, PILL_HEIGHT, 6);
    ctx.fillStyle = pill.paint.bgColor;
    ctx.fill();
    ctx.strokeStyle = pill.paint.borderColor;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = pill.paint.fgColor;
    ctx.fillText(
      pill.paint.text,
      pill.x + PILL_PAD_X,
      pillTextBaselineY(pill.y, ctx, theme),
    );
  }

  if (data.unmatched.length > 0) {
    const label = `+${data.unmatched.length} unmatched`;
    const labelWidth = measure(label);
    let ux = unmatchedX;
    let uy = unmatchedY;
    if (pills.length > 0 && ux - startX + labelWidth > maxWidth) {
      ux = startX;
      uy += GLIDE_WRAP_LINE_HEIGHT;
    }
    ctx.fillStyle = theme.textLight;
    ctx.fillText(label, ux, lineTextBaselineY(uy, ctx, theme));
  }
}

export const glideChipRenderer: CustomRenderer<CustomCell<GlideChipCellData>> = {
  kind: GridCellKind.Custom,
  isMatch: isGlideChipCell,
  draw: (args, cell) => drawGlideChipPills(args, cell.data),
};

export function buildGlideChipCell(data: GlideChipCellData): CustomCell<GlideChipCellData> {
  const copy = [
    ...data.segments.map((s) => s.text),
    ...data.unmatched,
  ].join(' · ');
  return {
    kind: GridCellKind.Custom,
    data,
    copyData: copy,
    allowOverlay: false,
    readonly: true,
  };
}
