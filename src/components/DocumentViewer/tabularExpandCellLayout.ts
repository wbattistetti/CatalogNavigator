/**
 * Size helpers for tabular cell expand overlay (wrapped text, copy-friendly).
 */
import { TABULAR_ROW_HEIGHT_PX } from './tabularLayout';

const CHAR_PX = 7;
const HORIZONTAL_PADDING_PX = 16;
const VERTICAL_PADDING_PX = 20;
const MAX_OVERLAY_HEIGHT_PX = 520;
const MIN_OVERLAY_WIDTH_PX = 280;
const MAX_OVERLAY_WIDTH_PX = 720;

/** Estimates overlay size from cell text and column width. */
export function estimateTabularExpandEditorSize(
  text: string,
  columnWidthPx: number,
): { width: number; height: number } {
  const width = Math.min(
    MAX_OVERLAY_WIDTH_PX,
    Math.max(MIN_OVERLAY_WIDTH_PX, Math.round(columnWidthPx)),
  );
  const innerWidth = Math.max(40, width - HORIZONTAL_PADDING_PX);
  const charsPerLine = Math.max(12, Math.floor(innerWidth / CHAR_PX));
  const lineHeightPx = 18;

  let wrappedLines = 0;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.length > 0 ? rawLine : ' ';
    wrappedLines += Math.max(1, Math.ceil(line.length / charsPerLine));
  }

  const height = Math.min(
    MAX_OVERLAY_HEIGHT_PX,
    Math.max(TABULAR_ROW_HEIGHT_PX + 8, wrappedLines * lineHeightPx + VERTICAL_PADDING_PX),
  );

  return { width, height };
}
