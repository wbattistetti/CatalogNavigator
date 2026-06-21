/**
 * Resolves a segmented row path to a catalog item path in the compiled bundle.
 */
import { canonicalizePathSegments } from '../pathCanonicalize';
import type { TokenCategory } from '../dictionaryTree';

export interface ResolvedCatalogPath {
  path: string;
  /** True when the path exists in the compiled catalog item list. */
  inCatalog: boolean;
}

/** Maps a live-segmentation path to the closest compiled catalog path. */
export function resolveCatalogTargetPath(
  rowPath: string,
  itemPaths: readonly string[],
  categories: readonly TokenCategory[],
): ResolvedCatalogPath {
  const trimmed = rowPath.trim();
  if (!trimmed) {
    return { path: '', inCatalog: false };
  }

  if (itemPaths.includes(trimmed)) {
    return { path: trimmed, inCatalog: true };
  }

  const canonical = canonicalizePathSegments(trimmed, [...categories]);
  if (canonical && itemPaths.includes(canonical)) {
    return { path: canonical, inCatalog: true };
  }

  const targetKey = (canonical || trimmed).split('.').filter(Boolean).sort().join('|');
  for (const itemPath of itemPaths) {
    const key = itemPath.split('.').filter(Boolean).sort().join('|');
    if (key === targetKey) {
      return { path: itemPath, inCatalog: true };
    }
  }

  const needleParts = new Set((canonical || trimmed).split('.').filter(Boolean));
  let bestPath = canonical || trimmed;
  let bestScore = 0;
  for (const itemPath of itemPaths) {
    const parts = itemPath.split('.').filter(Boolean);
    const score = parts.filter((seg) => needleParts.has(seg)).length;
    if (score > bestScore) {
      bestScore = score;
      bestPath = itemPath;
    }
  }

  if (bestScore > 0) {
    return { path: bestPath, inCatalog: true };
  }

  return { path: canonical || trimmed, inCatalog: false };
}
