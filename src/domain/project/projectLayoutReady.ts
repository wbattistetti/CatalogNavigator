/**
 * Project dictionary layout is ready for segmentation signature checks.
 */
export interface ProjectLayoutReadyInput {
  dictionariesLoading: boolean;
  hydratingLinked: boolean;
  loadedDictionaryCount: number;
}

/** False while dictionaries or linked libraries are still loading. */
export function isProjectDictionaryLayoutStable(input: ProjectLayoutReadyInput): boolean {
  return !input.dictionariesLoading
    && !input.hydratingLinked
    && input.loadedDictionaryCount > 0;
}
