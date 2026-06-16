/**
 * Incremental taxonomy sync when corpus leaf paths change (e.g. token dictionary edits).
 * Preserves NLU on unchanged slots; marks only affected roots dirty.
 */
import type { AnalysisRow } from '../hooks/useAnalysis';
import { buildTaxonomyFromItemPaths } from './analyzeAiPostProcess';
import { applyNluQuestionRules, invalidateNluAtSlots, mergeTaxonomyWithExistingNlu } from './nluQuestionRules';
import { normalizeItemPaths } from './itemPaths';
import type { TokenCategory } from './dictionaryTree';
import { getPathOrderingCategories } from './pathCanonicalize';
import type { LoadedDictionaryRef } from './multiDictionarySegment';
import {
  canonicalizeItemPaths,
  canonicalizeItemPathsFromLoadedRefs,
} from './pathCanonicalize';

export interface TaxonomySyncSummary {
  addedItemPaths: number;
  removedItemPaths: number;
  addedSlots: number;
  removedSlots: number;
}

export interface TaxonomySyncResult {
  rows: AnalysisRow[];
  item_paths: string[];
  dirtyRoots: string[];
  pathsUnchanged: boolean;
  summary: TaxonomySyncSummary;
}

export interface TaxonomySyncOptions {
  /** Canonicalize path segment order from single-dictionary categories. */
  categories?: TokenCategory[];
  /** Canonicalize path segment order from multi-dictionary ownership. */
  loadedRefs?: LoadedDictionaryRef[];
}

function resolvePathOrderingCategories(options?: TaxonomySyncOptions): TokenCategory[] | undefined {
  if (options?.loadedRefs?.length) return getPathOrderingCategories(options.loadedRefs);
  if (options?.categories?.length) return options.categories;
  return undefined;
}

function canonicalizePathsForSync(
  paths: string[],
  options?: TaxonomySyncOptions,
): string[] {
  if (options?.loadedRefs?.length) {
    return normalizeItemPaths(canonicalizeItemPathsFromLoadedRefs(paths, options.loadedRefs));
  }
  if (options?.categories?.length) {
    return normalizeItemPaths(canonicalizeItemPaths(paths, options.categories));
  }
  return normalizeItemPaths(paths);
}

function setsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((path) => setA.has(path));
}

function directChildren(slots: Set<string>, parent: string): string[] {
  const childDepth = parent.split('.').length + 1;
  const prefix = `${parent}.`;
  return [...slots].filter((slot) => slot.startsWith(prefix) && slot.split('.').length === childDepth);
}

/** Keeps only topmost dirty roots (regen subtree covers descendants). */
export function pruneToTopmostDirtyRoots(roots: string[]): string[] {
  const sorted = [...roots].sort((a, b) => a.split('.').length - b.split('.').length);
  const kept: string[] = [];
  for (const root of sorted) {
    if (!kept.some((k) => root === k || root.startsWith(`${k}.`))) kept.push(root);
  }
  return kept;
}

/** Finds tree roots that need NLU refresh after slot set changes. */
export function findDirtyRootsFromSlotDiff(oldSlots: Set<string>, newSlots: Set<string>): string[] {
  const dirty = new Set<string>();

  for (const slot of newSlots) {
    if (oldSlots.has(slot)) continue;
    const parent = slot.split('.').slice(0, -1).join('.');
    if (parent && newSlots.has(parent)) dirty.add(parent);
    else dirty.add(slot.split('.')[0] ?? slot);
  }

  for (const slot of oldSlots) {
    if (newSlots.has(slot)) continue;
    const parent = slot.split('.').slice(0, -1).join('.');
    if (parent && newSlots.has(parent)) {
      dirty.add(parent);
      continue;
    }
    const parts = slot.split('.');
    let marked = false;
    for (let i = parts.length - 1; i >= 1; i--) {
      const ancestor = parts.slice(0, i).join('.');
      if (newSlots.has(ancestor)) {
        dirty.add(ancestor);
        marked = true;
        break;
      }
    }
    if (!marked) dirty.add(parts[0] ?? slot);
  }

  const parents = new Set<string>();
  for (const slot of [...oldSlots, ...newSlots]) {
    const parent = slot.split('.').slice(0, -1).join('.');
    if (parent && newSlots.has(parent)) parents.add(parent);
  }

  for (const parent of parents) {
    const oldChildKey = directChildren(oldSlots, parent).sort().join('|');
    const newChildKey = directChildren(newSlots, parent).sort().join('|');
    if (oldChildKey !== newChildKey) dirty.add(parent);
  }

  return pruneToTopmostDirtyRoots([...dirty]);
}

/**
 * Rebuilds taxonomy from new leaf paths, merges unchanged NLU, invalidates dirty parents.
 * When item path sets are identical, returns existing rows unchanged (alias-only edits).
 */
export function syncTaxonomyFromLeafPaths(
  newLeafPaths: string[],
  existingRows?: AnalysisRow[] | null,
  existingItemPaths?: string[] | null,
  options?: TaxonomySyncOptions,
): TaxonomySyncResult {
  const item_paths = canonicalizePathsForSync(newLeafPaths, options);
  if (item_paths.length === 0) {
    throw new Error('Nessun path item dal corpus');
  }

  const rawOldItemPaths = normalizeItemPaths(existingItemPaths ?? []);
  const oldItemPaths = canonicalizePathsForSync(existingItemPaths ?? [], options);
  const emptySummary: TaxonomySyncSummary = {
    addedItemPaths: 0,
    removedItemPaths: 0,
    addedSlots: 0,
    removedSlots: 0,
  };

  const storedPathsAlreadyCanonical = setsEqual(rawOldItemPaths, oldItemPaths);
  if (
    existingRows?.length
    && setsEqual(item_paths, oldItemPaths)
    && storedPathsAlreadyCanonical
  ) {
    return {
      rows: existingRows,
      item_paths: oldItemPaths,
      dirtyRoots: [],
      pathsUnchanged: true,
      summary: emptySummary,
    };
  }

  const pathOrderingCategories = resolvePathOrderingCategories(options);
  const { rows: builtRows, item_paths: builtItems } = buildTaxonomyFromItemPaths(
    item_paths,
    pathOrderingCategories,
  );
  const merged = mergeTaxonomyWithExistingNlu(builtRows, existingRows);

  const oldSlots = new Set(existingRows?.map((row) => row.slot_filling) ?? []);
  const newSlots = new Set(merged.map((row) => row.slot_filling));

  const oldItems = new Set(oldItemPaths);
  const newItems = new Set(builtItems);
  const summary: TaxonomySyncSummary = {
    addedItemPaths: builtItems.filter((path) => !oldItems.has(path)).length,
    removedItemPaths: oldItemPaths.filter((path) => !newItems.has(path)).length,
    addedSlots: [...newSlots].filter((slot) => !oldSlots.has(slot)).length,
    removedSlots: [...oldSlots].filter((slot) => !newSlots.has(slot)).length,
  };

  const dirtyRoots = existingRows?.length
    ? findDirtyRootsFromSlotDiff(oldSlots, newSlots)
    : [];

  const invalidated = dirtyRoots.length > 0
    ? invalidateNluAtSlots(merged, dirtyRoots)
    : merged;

  const slotList = invalidated.map((row) => row.slot_filling);
  const rows = applyNluQuestionRules(
    slotList,
    invalidated,
    builtItems,
    pathOrderingCategories,
  );

  return {
    rows,
    item_paths: builtItems,
    dirtyRoots,
    pathsUnchanged: false,
    summary,
  };
}
