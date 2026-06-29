/**
 * Maps screen coordinates to a corpus extra-column display row using Glide getBounds.
 */
import type { DataEditorRef } from '@glideapps/glide-data-grid';

/** Returns display row index under clientX/clientY in the extra column, or null. */
export function resolveExtraDisplayRowAtClientPoint(
  gridRef: DataEditorRef | null | undefined,
  clientX: number,
  clientY: number,
  rowCount: number,
  extraColIndex: number,
): number | null {
  if (!gridRef || rowCount <= 0) return null;

  for (let row = 0; row < rowCount; row += 1) {
    const bounds = gridRef.getBounds(extraColIndex, row);
    if (!bounds) continue;
    if (
      clientX >= bounds.x
      && clientX <= bounds.x + bounds.width
      && clientY >= bounds.y
      && clientY <= bounds.y + bounds.height
    ) {
      return row;
    }
  }

  return null;
}
