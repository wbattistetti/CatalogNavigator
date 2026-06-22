/**
 * Canvas renderer for benchmark segmentation chips (colored pills, no React during scroll).
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
  GLIDE_BENCH_SEG_CELL,
  type GlideBenchSegCellData,
} from './glideBenchTypes';

const PILL_HEIGHT = 18;
const PILL_PAD_X = 6;
const PILL_GAP = 4;

export function isGlideBenchSegCell(
  cell: CustomCell,
): cell is CustomCell<GlideBenchSegCellData> {
  return cell.kind === GridCellKind.Custom
    && (cell.data as GlideBenchSegCellData | undefined)?.type === GLIDE_BENCH_SEG_CELL;
}

function drawSegmentationPills(
  args: Parameters<CustomRenderer<CustomCell<GlideBenchSegCellData>>['draw']>[0],
  data: GlideBenchSegCellData,
): void {
  const { ctx, rect, theme } = args;
  const { x, y, width: w, height: h } = rect;

  if (data.segments.length === 0 && data.unmatched.length === 0) {
    ctx.fillStyle = theme.textLight;
    ctx.font = theme.baseFontFull;
    ctx.fillText('—', x + theme.cellHorizontalPadding, y + h / 2 + getMiddleCenterBias(ctx, theme));
    return;
  }

  let renderX = x + theme.cellHorizontalPadding;
  const maxX = x + w - theme.cellHorizontalPadding;
  ctx.font = theme.baseFontFull;

  for (const seg of data.segments) {
    const textWidth = measureTextCached(seg.text, ctx, theme.baseFontFull).width;
    const pillW = textWidth + PILL_PAD_X * 2;
    if (renderX + pillW > maxX) break;

    const pillY = y + (h - PILL_HEIGHT) / 2;
    ctx.beginPath();
    roundedRect(ctx, renderX, pillY, pillW, PILL_HEIGHT, 6);
    ctx.fillStyle = seg.bgColor;
    ctx.fill();
    ctx.strokeStyle = seg.borderColor;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = seg.fgColor;
    ctx.fillText(
      seg.text,
      renderX + PILL_PAD_X,
      y + h / 2 + getMiddleCenterBias(ctx, theme),
    );

    renderX += pillW + PILL_GAP;
  }

  if (data.unmatched.length > 0 && renderX < maxX) {
    const label = `+${data.unmatched.length} unmatched`;
    ctx.fillStyle = theme.textLight;
    ctx.fillText(label, renderX, y + h / 2 + getMiddleCenterBias(ctx, theme));
  }
}

export const glideBenchSegmentationRenderer: CustomRenderer<CustomCell<GlideBenchSegCellData>> = {
  kind: GridCellKind.Custom,
  isMatch: isGlideBenchSegCell,
  draw: (args, cell) => drawSegmentationPills(args, cell.data),
};

export function buildGlideBenchSegCell(data: GlideBenchSegCellData): CustomCell<GlideBenchSegCellData> {
  const copy = [
    ...data.segments.map((s) => s.text),
    ...data.unmatched,
  ].join(' · ');
  return {
    kind: GridCellKind.Custom,
    data,
    copyData: copy,
    allowOverlay: true,
    readonly: true,
    activationBehaviorOverride: 'single-click',
  };
}
