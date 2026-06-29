/**
 * Maps Glide gridSelection to extra-column display-row indices.
 */
import type { GridSelection } from '@glideapps/glide-data-grid';

function rowsInExtraColumnFromRect(
  rect: { x: number; y: number; width: number; height: number },
  extraColIndex: number,
  out: Set<number>,
): void {
  if (extraColIndex < rect.x || extraColIndex >= rect.x + rect.width) return;
  for (let row = rect.y; row < rect.y + rect.height; row += 1) out.add(row);
}

/** Returns sorted display rows whose selection range overlaps the extra column. */
export function extraColumnDisplayRowsFromGridSelection(
  selection: GridSelection,
  extraColIndex: number,
): number[] {
  const rows = new Set<number>();
  const current = selection.current;
  if (!current) return [];

  const [focusCol, focusRow] = current.cell;
  if (focusCol === extraColIndex) rows.add(focusRow);

  rowsInExtraColumnFromRect(current.range, extraColIndex, rows);
  for (const rect of current.rangeStack) rowsInExtraColumnFromRect(rect, extraColIndex, rows);

  return [...rows].sort((a, b) => a - b);
}
