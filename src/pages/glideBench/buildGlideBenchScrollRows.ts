/**
 * Builds Glide scroll-benchmark rows with precalculated colored chips (no live segmentation).
 */
import { buildRowOntologyText } from '../../lib/columnRoles';
import { chipSurfaceStyleFromColor } from '../../lib/categoryIconCatalog';
import type { ParsedTabular } from '../../lib/parseTabular';
import type { GlideBenchRow, GlideBenchSegPaint } from './glideBenchTypes';
import { resolveBenchDescriptionColumns } from './buildGlideBenchRows';

const CHIP_COLORS = [
  '#f59e0b',
  '#38bdf8',
  '#34d399',
  '#a78bfa',
  '#f472b6',
] as const;

const MAX_CHIP_LABEL_CHARS = 40;

function truncateChipLabel(text: string): string {
  if (text.length <= MAX_CHIP_LABEL_CHARS) return text;
  return `${text.slice(0, MAX_CHIP_LABEL_CHARS - 1)}…`;
}

function paintForValue(text: string, colorHex: string): GlideBenchSegPaint {
  const surface = chipSurfaceStyleFromColor(colorHex);
  return {
    text: truncateChipLabel(text),
    bgColor: surface.backgroundColor,
    borderColor: surface.borderColor,
    fgColor: surface.color,
  };
}

/**
 * Maps CSV rows to benchmark grid rows using one colored chip per description column.
 * Synchronous and cheap — intended for Glide scroll testing without dictionary matching.
 */
export function buildGlideBenchScrollRows(tabular: ParsedTabular): GlideBenchRow[] {
  const descColumns = resolveBenchDescriptionColumns(tabular.headers);

  return tabular.rows.map((row, sourceIndex) => {
    const description = buildRowOntologyText(row, tabular.headers, descColumns);
    const paints: GlideBenchSegPaint[] = [];
    const segmentTexts: string[] = [];

    descColumns.forEach((column, columnIndex) => {
      const colIdx = tabular.headers.indexOf(column);
      if (colIdx < 0) return;
      const value = String(row[colIdx] ?? '').trim();
      if (!value || value === '-') return;
      const color = CHIP_COLORS[columnIndex % CHIP_COLORS.length]!;
      paints.push(paintForValue(value, color));
      segmentTexts.push(value);
    });

    return {
      sourceIndex,
      description,
      segmentation: {
        segments: segmentTexts,
        unmatched: [],
        path: segmentTexts.join('.'),
      },
      paints,
    };
  });
}
