/**
 * Layout constants and width helpers for the virtualized tabular preview grid.
 */

export const TABULAR_ROW_HEIGHT_PX = 36;
export const TABULAR_DELETE_COL_WIDTH_PX = 40;
export const TABULAR_FIXED_COLUMN_MAX_PX = 420;
export const TABULAR_WIDTH_SAMPLE_ROWS = 200;

const CHAR_PX = 7;
const PADDING_PX = 36;
const MIN_COL_PX = 56;

/** Rows sampled for column width estimation (full scan avoided on large tables). */
export function sampleRowsForWidth(rows: string[][]): string[][] {
  if (rows.length <= TABULAR_WIDTH_SAMPLE_ROWS) return rows;
  return rows.slice(0, TABULAR_WIDTH_SAMPLE_ROWS);
}

/** Shrink-wrap column width from header + sampled cell content. */
export function autoColumnWidthPx(
  header: string,
  rows: string[][],
  colIdx: number,
  extraHeaderChars = 0,
  maxPx = TABULAR_FIXED_COLUMN_MAX_PX,
): number {
  let maxChars = header.length + extraHeaderChars;
  for (const row of rows) {
    maxChars = Math.max(maxChars, (row[colIdx] ?? '').length);
  }
  return Math.min(maxPx, Math.max(MIN_COL_PX, maxChars * CHAR_PX + PADDING_PX));
}

/** CSS grid template for delete column + data columns (flex col uses minmax). */
export function buildTabularGridTemplate(
  columnWidths: number[],
  flexColumnVi: number,
): string {
  const dataCols = columnWidths.map((w, vi) =>
    vi === flexColumnVi ? `minmax(${w}px, 1fr)` : `${w}px`,
  );
  return `${TABULAR_DELETE_COL_WIDTH_PX}px ${dataCols.join(' ')}`;
}

/** Minimum table width so horizontal scroll works when columns exceed viewport. */
export function tabularTableMinWidthPx(columnWidths: number[], flexColumnVi: number): number {
  const flexMin = columnWidths[flexColumnVi] ?? 200;
  const fixedSum = columnWidths.reduce(
    (sum, w, vi) => (vi === flexColumnVi ? sum : sum + w),
    TABULAR_DELETE_COL_WIDTH_PX,
  );
  return fixedSum + flexMin;
}
