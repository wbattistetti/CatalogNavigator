/**
 * Glide custom cell renderer: plain text interleaved with colored chip pills.
 */
import {
  GridCellKind,
  getMiddleCenterBias,
  measureTextCached,
  roundedRect,
  type CustomCell,
  type CustomRenderer,
} from '@glideapps/glide-data-grid';
import type { GlideChipPaint } from './glideChipRenderer';

export const GLIDE_DESC_CELL = 'glide-desc' as const;

export type GlideDescRun =
  | { kind: 'text'; text: string }
  | { kind: 'chip'; text: string; paint: GlideChipPaint };

export interface GlideDescCellData {
  type: typeof GLIDE_DESC_CELL;
  sourceText: string;
  runs: GlideDescRun[];
}

const PILL_HEIGHT = 18;
const PILL_PAD_X = 6;
const RUN_GAP = 2;

export function isGlideDescCell(
  cell: CustomCell,
): cell is CustomCell<GlideDescCellData> {
  return cell.kind === GridCellKind.Custom
    && (cell.data as GlideDescCellData | undefined)?.type === GLIDE_DESC_CELL;
}

function drawDescriptionRuns(
  args: Parameters<CustomRenderer<CustomCell<GlideDescCellData>>['draw']>[0],
  data: GlideDescCellData,
): void {
  const { ctx, rect, theme } = args;
  const { x, y, width: w, height: h } = rect;
  const maxX = x + w - theme.cellHorizontalPadding;
  let renderX = x + theme.cellHorizontalPadding;
  ctx.font = theme.baseFontFull;

  if (data.runs.length === 0) {
    ctx.fillStyle = theme.textDark;
    ctx.fillText(data.sourceText, renderX, y + h / 2 + getMiddleCenterBias(ctx, theme));
    return;
  }

  for (const run of data.runs) {
    if (renderX >= maxX) break;

    if (run.kind === 'text') {
      const textWidth = measureTextCached(run.text, ctx, theme.baseFontFull).width;
      if (renderX + textWidth > maxX) {
        const slice = truncateToWidth(run.text, ctx, theme.baseFontFull, maxX - renderX);
        if (slice) {
          ctx.fillStyle = theme.textDark;
          ctx.fillText(slice, renderX, y + h / 2 + getMiddleCenterBias(ctx, theme));
        }
        break;
      }
      ctx.fillStyle = theme.textDark;
      ctx.fillText(run.text, renderX, y + h / 2 + getMiddleCenterBias(ctx, theme));
      renderX += textWidth + RUN_GAP;
      continue;
    }

    const seg = run.paint;
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
    renderX += pillW + RUN_GAP;
  }
}

function truncateToWidth(
  text: string,
  ctx: CanvasRenderingContext2D,
  font: string,
  maxWidth: number,
): string {
  if (maxWidth <= 0) return '';
  let slice = text;
  while (slice.length > 0 && measureTextCached(slice, ctx, font).width > maxWidth) {
    slice = slice.slice(0, -1);
  }
  if (slice.length < text.length && slice.length > 0) {
    return `${slice.slice(0, -1)}…`;
  }
  return slice;
}

export const glideDescriptionRenderer: CustomRenderer<CustomCell<GlideDescCellData>> = {
  kind: GridCellKind.Custom,
  isMatch: isGlideDescCell,
  draw: (args, cell) => drawDescriptionRuns(args, cell.data),
};

export function buildGlideDescCell(data: GlideDescCellData): CustomCell<GlideDescCellData> {
  return {
    kind: GridCellKind.Custom,
    data,
    copyData: data.sourceText,
    allowOverlay: true,
    readonly: true,
    allowWrapping: true,
    activationBehaviorOverride: 'single-click',
  };
}
