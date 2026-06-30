/**
 * Word-wrap and pill-flow layout helpers for Glide corpus cells (height estimate + draw).
 */
import { getMiddleCenterBias } from '@glideapps/glide-data-grid';
import type { Theme } from '@glideapps/glide-data-grid';
import type { GlideChipPaint } from './glideChipRenderer';
import type { GlideDescRun } from './glideDescriptionRenderer';

export const GLIDE_WRAP_LINE_HEIGHT = 20;
export const GLIDE_WRAP_PILL_HEIGHT = 18;
export const GLIDE_WRAP_PILL_PAD_X = 6;
export const GLIDE_WRAP_RUN_GAP = 2;
export const GLIDE_WRAP_PILL_GAP = 4;
/** Top + bottom cell padding — matches TABULAR_GLIDE_THEME.cellVerticalPadding (2px each). */
export const GLIDE_WRAP_CELL_V_PAD = 4;
export const GLIDE_WRAP_CELL_H_PAD = 8;

/** Canvas font string aligned with TABULAR_GLIDE_THEME (12px monospace). */
export const GLIDE_CORPUS_FONT = '12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

export type MeasureTextWidth = (text: string) => number;

function pillWidth(text: string, measure: MeasureTextWidth): number {
  return measure(text) + GLIDE_WRAP_PILL_PAD_X * 2;
}

/** Top Y of a chip pill inside a wrapped line. */
export function pillTopY(lineY: number): number {
  return lineY + (GLIDE_WRAP_LINE_HEIGHT - GLIDE_WRAP_PILL_HEIGHT) / 2;
}

/** Canvas baseline Y for plain text centered on a wrapped line. */
export function lineTextBaselineY(
  lineY: number,
  ctx: CanvasRenderingContext2D,
  theme: Theme,
): number {
  return lineY + GLIDE_WRAP_LINE_HEIGHT / 2 + getMiddleCenterBias(ctx, theme);
}

/** Canvas baseline Y for label text centered inside a chip pill. */
export function pillTextBaselineY(
  lineY: number,
  ctx: CanvasRenderingContext2D,
  theme: Theme,
): number {
  return pillTopY(lineY) + GLIDE_WRAP_PILL_HEIGHT / 2 + getMiddleCenterBias(ctx, theme);
}

/** Estimates wrapped line count for plain description text. */
export function estimateWrappedTextLines(
  text: string,
  maxWidth: number,
  measure: MeasureTextWidth,
): number {
  const trimmed = text.trim();
  if (!trimmed || maxWidth <= 0) return 1;

  const words = trimmed.split(/\s+/);
  let lines = 1;
  let lineWidth = 0;

  for (const word of words) {
    const wordWidth = measure(word);
    const nextWidth = lineWidth === 0 ? wordWidth : lineWidth + measure(' ') + wordWidth;
    if (nextWidth > maxWidth && lineWidth > 0) {
      lines += 1;
      lineWidth = wordWidth;
    } else {
      lineWidth = nextWidth;
    }
  }

  return lines;
}

/** Estimates wrapped line count for description runs (text + inline chips). */
export function estimateDescriptionRunLines(
  runs: readonly GlideDescRun[],
  maxWidth: number,
  measure: MeasureTextWidth,
): number {
  if (runs.length === 0) return 1;
  if (maxWidth <= 0) return 1;

  let lines = 1;
  let lineWidth = 0;

  const nextLine = (width: number) => {
    if (lineWidth > 0) lines += 1;
    lineWidth = width;
  };

  for (const run of runs) {
    if (run.kind === 'chip') {
      const w = pillWidth(run.text, measure) + GLIDE_WRAP_RUN_GAP;
      if (lineWidth > 0 && lineWidth + w > maxWidth) nextLine(w);
      else lineWidth += w;
      continue;
    }

    const words = run.text.split(/(\s+)/);
    for (const part of words) {
      if (!part) continue;
      const partWidth = measure(part);
      if (part.trim() === '') {
        if (lineWidth + partWidth > maxWidth && lineWidth > 0) nextLine(0);
        else lineWidth += partWidth;
        continue;
      }
      if (lineWidth > 0 && lineWidth + partWidth > maxWidth) nextLine(partWidth);
      else lineWidth += partWidth;
    }
  }

  return Math.max(1, lines);
}

/** Estimates wrapped line count for segmentation chip pills. */
export function estimateChipPillLines(
  segments: readonly GlideChipPaint[],
  unmatchedCount: number,
  maxWidth: number,
  measure: MeasureTextWidth,
): number {
  if (segments.length === 0 && unmatchedCount === 0) return 1;
  if (maxWidth <= 0) return 1;

  let lines = 1;
  let lineWidth = 0;

  for (const seg of segments) {
    const w = pillWidth(seg.text, measure) + GLIDE_WRAP_PILL_GAP;
    if (lineWidth > 0 && lineWidth + w > maxWidth) {
      lines += 1;
      lineWidth = w;
    } else {
      lineWidth += w;
    }
  }

  if (unmatchedCount > 0) {
    const label = `+${unmatchedCount} unmatched`;
    const w = measure(label) + GLIDE_WRAP_PILL_GAP;
    if (lineWidth > 0 && lineWidth + w > maxWidth) lines += 1;
  }

  return Math.max(1, lines);
}

export function corpusGlideRowHeight(
  lineCounts: readonly number[],
  minHeight = 48,
): number {
  const contentLines = Math.max(1, ...lineCounts);
  return Math.max(minHeight, GLIDE_WRAP_CELL_V_PAD + contentLines * GLIDE_WRAP_LINE_HEIGHT);
}

/** Inner drawable width inside a Glide column (horizontal padding on both sides). */
export function glideCorpusCellInnerWidth(
  colWidth: number,
  horizontalPad = GLIDE_WRAP_CELL_H_PAD,
): number {
  return Math.max(64, colWidth - horizontalPad * 2);
}

/** Fast monospace width estimate for row-height layout (no canvas). */
export function monospaceTextMeasure(charWidth = 6.4): MeasureTextWidth {
  return (text: string) => text.length * charWidth;
}

let glideCorpusTextMeasureCache: MeasureTextWidth | null = null;

/**
 * Text width measure for corpus row-height layout — same font metrics as canvas draw.
 */
export function glideCorpusTextMeasure(): MeasureTextWidth {
  if (glideCorpusTextMeasureCache) return glideCorpusTextMeasureCache;

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      glideCorpusTextMeasureCache = (text: string) => {
        ctx.font = GLIDE_CORPUS_FONT;
        return ctx.measureText(text).width;
      };
      return glideCorpusTextMeasureCache;
    }
  }

  glideCorpusTextMeasureCache = monospaceTextMeasure(7.1);
  return glideCorpusTextMeasureCache;
}

/** Line count for chip pills + optional "+N unmatched" suffix (matches canvas draw). */
export function chipPillLayoutLineCount(
  segments: readonly GlideChipPaint[],
  unmatchedCount: number,
  maxWidth: number,
  measure: MeasureTextWidth,
): number {
  if (segments.length === 0 && unmatchedCount === 0) return 1;
  if (maxWidth <= 0) return 1;

  const startX = 0;
  const { lineCount, unmatchedX } = layoutChipPills(segments, startX, 0, maxWidth, measure);

  if (unmatchedCount <= 0) return Math.max(1, lineCount);

  const label = `+${unmatchedCount} unmatched`;
  const labelWidth = measure(label);
  if (segments.length > 0 && unmatchedX - startX + labelWidth > maxWidth) {
    return Math.max(1, lineCount + 1);
  }
  return Math.max(1, lineCount);
}

export function estimateCorpusGlideRowHeight(input: {
  sourceText: string;
  descriptionRuns: readonly GlideDescRun[];
  segmentTexts: readonly string[];
  extraSegmentTexts?: readonly string[];
  unmatchedCount: number;
  descriptionColWidth: number;
  segmentationColWidth: number;
  extraColWidth: number;
  minHeight?: number;
}): number {
  const measure = glideCorpusTextMeasure();
  const descInner = glideCorpusCellInnerWidth(input.descriptionColWidth);
  const segInner = glideCorpusCellInnerWidth(input.segmentationColWidth);
  const extraInner = glideCorpusCellInnerWidth(input.extraColWidth);

  const runs = input.descriptionRuns.length > 0
    ? input.descriptionRuns
    : (input.sourceText.length > 0 ? [{ kind: 'text' as const, text: input.sourceText }] : []);

  const descLines = runs.length > 0
    ? layoutDescriptionRuns(runs, 0, 0, descInner, measure).lineCount
    : 1;

  const segPaints: GlideChipPaint[] = input.segmentTexts.map((text) => ({
    text,
    bgColor: '',
    borderColor: '',
    fgColor: '',
  }));
  const segLines = chipPillLayoutLineCount(segPaints, input.unmatchedCount, segInner, measure);

  const extraTexts = input.extraSegmentTexts ?? [];
  const extraLines = extraTexts.length > 0
    ? layoutChipPills(
      extraTexts.map((text) => ({
        text,
        bgColor: '',
        borderColor: '',
        fgColor: '',
      })),
      0,
      0,
      extraInner,
      measure,
    ).lineCount
    : 0;

  return corpusGlideRowHeight([descLines, segLines, extraLines], input.minHeight);
}

export const CORPUS_GLIDE_EXTRA_COL_WIDTH = 160;

export function corpusGlideColumnWidths(gridWidth: number): {
  index: number;
  description: number;
  extra: number;
  segmentation: number;
} {
  const index = 56;
  const extra = CORPUS_GLIDE_EXTRA_COL_WIDTH;
  const remaining = Math.max(0, gridWidth - index - extra);
  const half = Math.floor(remaining / 2);
  return {
    index,
    extra,
    description: half,
    segmentation: remaining - half,
  };
}

interface PlacedPill {
  paint: GlideChipPaint;
  x: number;
  y: number;
  width: number;
}

/** Flows chip pills onto wrapped lines for canvas drawing. */
export function layoutChipPills(
  segments: readonly GlideChipPaint[],
  startX: number,
  startY: number,
  maxWidth: number,
  measure: MeasureTextWidth,
): { pills: PlacedPill[]; lineCount: number; unmatchedY: number; unmatchedX: number } {
  let x = startX;
  let y = startY;
  let lineCount = 1;
  const pills: PlacedPill[] = [];

  for (const paint of segments) {
    const width = pillWidth(paint.text, measure);
    const block = width + GLIDE_WRAP_PILL_GAP;
    if (x > startX && x + block > startX + maxWidth) {
      x = startX;
      y += GLIDE_WRAP_LINE_HEIGHT;
      lineCount += 1;
    }
    pills.push({ paint, x, y, width });
    x += block;
  }

  return { pills, lineCount, unmatchedX: x, unmatchedY: y };
}

interface PlacedRun {
  run: GlideDescRun;
  x: number;
  y: number;
  maxWidth: number;
}

/** Flows description runs (text + chips) onto wrapped lines for canvas drawing. */
export function layoutDescriptionRuns(
  runs: readonly GlideDescRun[],
  startX: number,
  startY: number,
  maxWidth: number,
  measure: MeasureTextWidth,
): { items: PlacedRun[]; lineCount: number } {
  if (runs.length === 0) return { items: [], lineCount: 1 };

  let x = startX;
  let y = startY;
  let lineCount = 1;
  const items: PlacedRun[] = [];

  const ensureFits = (width: number) => {
    if (x > startX && x + width > startX + maxWidth) {
      x = startX;
      y += GLIDE_WRAP_LINE_HEIGHT;
      lineCount += 1;
    }
  };

  for (const run of runs) {
    if (run.kind === 'chip') {
      const width = pillWidth(run.text, measure);
      ensureFits(width);
      items.push({ run, x, y, maxWidth: width });
      x += width + GLIDE_WRAP_RUN_GAP;
      continue;
    }

    const words = run.text.split(/\s+/).filter(Boolean);
    for (let i = 0; i < words.length; i += 1) {
      const word = words[i]!;
      const spaceW = i > 0 && x > startX ? measure(' ') : 0;
      const wordW = measure(word);
      ensureFits(spaceW + wordW);
      if (spaceW > 0) {
        items.push({ run: { kind: 'text', text: ' ' }, x, y, maxWidth: spaceW });
        x += spaceW;
      }
      items.push({ run: { kind: 'text', text: word }, x, y, maxWidth: wordW });
      x += wordW;
    }
  }

  return { items, lineCount: Math.max(1, lineCount) };
}
