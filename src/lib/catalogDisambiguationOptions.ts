/**
 * Catalog value-set keys for disambiguation options (runtime VB tokens).
 */
import type { AgentBundle } from './agentBundleTypes';
import { getItemAttributoValueSetKey } from './valueSet';

/** Distinct attributo value-set keys among corpus items on the given paths. */
export function distinctCatalogOptionsForCategory(
  bundle: AgentBundle,
  categoryName: string,
  candidatePaths: readonly string[],
): string[] {
  const paths = new Set(candidatePaths.map((p) => p.trim()).filter(Boolean));
  const sets = new Set<string>();
  for (const item of bundle.corpusItems) {
    if (!paths.has(item.path)) continue;
    sets.add(getItemAttributoValueSetKey(item, categoryName));
  }
  return [...sets].sort((a, b) => a.localeCompare(b, 'it'));
}

export function sameOptionTokenSets(a: readonly string[], b: readonly string[]): boolean {
  const norm = (items: readonly string[]) =>
    [...items].map((o) => o.trim().toLowerCase()).filter(Boolean).sort().join('\0');
  return norm(a) === norm(b);
}
