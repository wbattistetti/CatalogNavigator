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
import {
  GLIDE_WRAP_LINE_HEIGHT,
  GLIDE_WRAP_PILL_HEIGHT,
  GLIDE_WRAP_PILL_PAD_X,
  layoutDescriptionRuns,
  lineTextBaselineY,
  pillTextBaselineY,
  pillTopY,
} from './glideWrapLayout';
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

const PILL_HEIGHT = GLIDE_WRAP_PILL_HEIGHT;
const PILL_PAD_X = GLIDE_WRAP_PILL_PAD_X;

export function isGlideDescCell(
  cell: CustomCell,
): cell is CustomCell<GlideDescCellData> {
  return cell.kind === GridCellKind.Custom
    && (cell.data as GlideDescCellData | undefined)?.type === GLIDE_DESC_CELL;
}

export function drawDescriptionRuns(
  args: Parameters<CustomRenderer<CustomCell<GlideDescCellData>>['draw']>[0],
  data: GlideDescCellData,
): void {
  const { ctx, rect, theme } = args;
  const { x, y, width: w, height: h } = rect;
  const padX = theme.cellHorizontalPadding;
  const maxWidth = w - padX * 2;
  const startX = x + padX;
  const startY = y + theme.cellVerticalPadding;
  ctx.font = theme.baseFontFull;

  const measure = (text: string) => measureTextCached(text, ctx, theme.baseFontFull).width;

  if (data.runs.length === 0) {
    ctx.fillStyle = theme.textDark;
    const { items, lineCount } = layoutDescriptionRuns(
      data.sourceText.length > 0 ? [{ kind: 'text', text: data.sourceText }] : [],
      startX,
      startY,
      maxWidth,
      measure,
    );
    for (const item of items) {
      if (item.run.kind !== 'text') continue;
      ctx.fillText(
        item.run.text,
        item.x,
        lineTextBaselineY(item.y, ctx, theme),
      );
    }
    if (items.length === 0) {
      ctx.fillText(data.sourceText, startX, y + h / 2 + getMiddleCenterBias(ctx, theme));
    }
    void lineCount;
    return;
  }

  const { items } = layoutDescriptionRuns(data.runs, startX, startY, maxWidth, measure);
  for (const item of items) {
    if (item.run.kind === 'text') {
      ctx.fillStyle = theme.textDark;
      ctx.fillText(
        item.run.text,
        item.x,
        lineTextBaselineY(item.y, ctx, theme),
      );
      continue;
    }

    const seg = item.run.paint;
    const pillY = pillTopY(item.y);
    ctx.beginPath();
    roundedRect(ctx, item.x, pillY, item.maxWidth, PILL_HEIGHT, 6);
    ctx.fillStyle = seg.bgColor;
    ctx.fill();
    ctx.strokeStyle = seg.borderColor;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = seg.fgColor;
    ctx.fillText(
      seg.text,
      item.x + PILL_PAD_X,
      pillTextBaselineY(item.y, ctx, theme),
    );
  }
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
    allowOverlay: false,
    readonly: true,
    allowWrapping: true,
  };
}
