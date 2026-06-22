/**
 * Syncs flat catalog item_paths from corpus segmentation — no taxonomy tree.
 */

export interface ItemPathSyncSummary {
  addedItemPaths: number;
  removedItemPaths: number;
}

export interface ItemPathSyncResult {
  item_paths: string[];
  pathsUnchanged: boolean;
  summary: ItemPathSyncSummary;
}

function sortedUnique(paths: readonly string[]): string[] {
  return [...new Set(paths.map((p) => p.trim()).filter(Boolean))].sort();
}

/** Compares resolved leaf paths with stored item_paths. */
export function syncItemPaths(
  leafPaths: readonly string[],
  existingPaths: readonly string[] | null | undefined,
): ItemPathSyncResult {
  const next = sortedUnique(leafPaths);
  const prev = sortedUnique(existingPaths ?? []);
  const prevSet = new Set(prev);
  const nextSet = new Set(next);

  const addedItemPaths = next.filter((p) => !prevSet.has(p)).length;
  const removedItemPaths = prev.filter((p) => !nextSet.has(p)).length;
  const pathsUnchanged = addedItemPaths === 0 && removedItemPaths === 0 && next.length === prev.length;

  return {
    item_paths: next,
    pathsUnchanged,
    summary: { addedItemPaths, removedItemPaths },
  };
}
