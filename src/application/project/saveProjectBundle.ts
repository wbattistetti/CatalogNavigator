/**
 * Orchestrates a full project save: all dirty dictionaries, then analysis.
 */
import type { KbDictionary } from '../../lib/dictionaryLibrary';

export interface SaveProjectBundleDeps {
  saveAllDirtyDictionaries: () => Promise<KbDictionary[]>;
  saveAnalysis: () => Promise<void>;
}

export interface SaveProjectBundleResult {
  savedDictionaries: KbDictionary[];
}

/** Persists every dirty dictionary session, then ontology analysis when allowed. */
export async function saveProjectBundle(
  deps: SaveProjectBundleDeps,
): Promise<SaveProjectBundleResult> {
  const savedDictionaries = await deps.saveAllDirtyDictionaries();
  await deps.saveAnalysis();
  return { savedDictionaries };
}
