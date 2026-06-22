/**
 * Maps display row indices to source row indices for filtered tabular views.
 */

export interface DisplayRowModel {
  count: number;
  toSourceIndex: (displayRow: number) => number | undefined;
}

function buildFilteredSourceIndices(
  rowCount: number,
  rows: readonly string[][],
  visibleColumnIndices: readonly number[],
  needle: string,
): number[] {
  const indices: number[] = [];
  for (let i = 0; i < rowCount; i++) {
    const row = rows[i]!;
    for (let vi = 0; vi < visibleColumnIndices.length; vi++) {
      const ci = visibleColumnIndices[vi]!;
      if (row[ci]?.toLowerCase().includes(needle)) {
        indices.push(i);
        break;
      }
    }
  }
  return indices;
}

/** O(1) identity mapping when unfiltered; compact list when filtered. */
export function buildDisplayRowModel(
  rowCount: number,
  rows: readonly string[][],
  visibleColumnIndices: readonly number[],
  filter: string,
): DisplayRowModel {
  const trimmed = filter.trim();
  if (!trimmed) {
    return {
      count: rowCount,
      toSourceIndex: (displayRow) =>
        displayRow >= 0 && displayRow < rowCount ? displayRow : undefined,
    };
  }

  const indices = buildFilteredSourceIndices(
    rowCount,
    rows,
    visibleColumnIndices,
    trimmed.toLowerCase(),
  );
  return {
    count: indices.length,
    toSourceIndex: (displayRow) => indices[displayRow],
  };
}

/** Source row indices in file order (no sort — avoids blocking main thread on 11k rows). */
export function buildDisplayRowIndices(
  rowCount: number,
  rows: string[][],
  visibleColumnIndices: number[],
  filter: string,
): number[] {
  const model = buildDisplayRowModel(rowCount, rows, visibleColumnIndices, filter);
  const indices = new Array<number>(model.count);
  for (let i = 0; i < model.count; i++) {
    indices[i] = model.toSourceIndex(i)!;
  }
  return indices;
}
