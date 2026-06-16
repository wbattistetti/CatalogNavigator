/**
 * Detects ontology path drift from live dictionary layout and rebuilds the tree on demand.
 */
import { useCallback, useMemo } from 'react';
import {
  mergeAllDictionarySessionsIntoLoadedRefs,
  segmentAllDescriptionsFromLoadedRefs,
  type LoadedDictionaryRef,
} from '../../lib/multiDictionarySegment';
import {
  canonicalizedPathSetsEqual,
  getPathOrderingCategories,
  itemPathsNeedCanonicalizationFromLoadedRefs,
} from '../../lib/pathCanonicalize';
import type { TokenDictionary } from '../../lib/tokenDictionary';
import type { DictionaryPanelState } from '../../components/DocumentViewer/DictionaryPanel';
import type { UseProjectDictionariesResult } from '../../hooks/useProjectDictionaries';

export type AgentDictionaryContext = {
  dictionary: TokenDictionary;
  descriptions: string[];
  activeTokenCount: number;
};

function ontologyPathsMatchSaved(
  leafPaths: string[],
  itemPaths: string[] | null | undefined,
  loadedRefs: LoadedDictionaryRef[],
): boolean {
  if (itemPathsNeedCanonicalizationFromLoadedRefs(itemPaths ?? [], loadedRefs)) {
    return false;
  }
  return canonicalizedPathSetsEqual(leafPaths, itemPaths ?? [], loadedRefs);
}

export interface UseOntologyRefreshParams {
  dictState: DictionaryPanelState | null;
  agentDictionaryContext: AgentDictionaryContext | null;
  dicts: UseProjectDictionariesResult;
  hasTaxonomy: boolean;
  generating: boolean;
  itemPaths: string[] | null | undefined;
  syncTaxonomyFromLoadedRefs: (
    descriptions: string[],
    loadedRefs: LoadedDictionaryRef[],
  ) => unknown;
}

export function useOntologyRefresh({
  dictState,
  agentDictionaryContext,
  dicts,
  hasTaxonomy,
  generating,
  itemPaths,
  syncTaxonomyFromLoadedRefs,
}: UseOntologyRefreshParams) {
  const buildLiveLoadedRefs = useCallback(
    () => mergeAllDictionarySessionsIntoLoadedRefs(
      dicts.loadedRefs,
      (id) => dicts.getSession(id),
    ),
    [dicts.loadedRefs, dicts.getSession, dicts.dictionarySessionsRevision],
  );

  const liveLoadedRefs = useMemo(
    () => buildLiveLoadedRefs(),
    [buildLiveLoadedRefs],
  );

  const ontologyLeafPaths = useMemo(() => {
    const descriptions = dictState?.getDescriptions()
      ?? agentDictionaryContext?.descriptions
      ?? [];
    if (descriptions.length === 0) return [];
    if (liveLoadedRefs.length === 0) return [];
    return segmentAllDescriptionsFromLoadedRefs(descriptions, liveLoadedRefs).leafPaths;
  }, [
    agentDictionaryContext?.descriptions,
    dictState,
    liveLoadedRefs,
    dicts.dictionarySessionsRevision,
  ]);

  const agentNeedsUpdate = useMemo(() => {
    if (!hasTaxonomy || ontologyLeafPaths.length === 0) return false;
    return !ontologyPathsMatchSaved(ontologyLeafPaths, itemPaths, liveLoadedRefs);
  }, [hasTaxonomy, itemPaths, liveLoadedRefs, ontologyLeafPaths]);

  const canRefreshOntology = ontologyLeafPaths.length > 0 && !generating;

  const refreshOntology = useCallback(() => {
    const descriptions = dictState?.getDescriptions()
      ?? agentDictionaryContext?.descriptions
      ?? [];
    if (descriptions.length === 0) return;

    const liveRefs = buildLiveLoadedRefs();
    if (liveRefs.length === 0) return;

    try {
      syncTaxonomyFromLoadedRefs(descriptions, liveRefs);
    } catch {
      /* error surfaced via analysisApi.error */
    }
  }, [
    agentDictionaryContext?.descriptions,
    buildLiveLoadedRefs,
    dictState,
    syncTaxonomyFromLoadedRefs,
  ]);

  const pathOrderingCategories = useMemo(
    () => (liveLoadedRefs.length > 0 ? getPathOrderingCategories(liveLoadedRefs) : []),
    [liveLoadedRefs],
  );

  return {
    agentNeedsUpdate,
    canRefreshOntology,
    refreshOntology,
    buildLiveLoadedRefs,
    liveLoadedRefs,
    pathOrderingCategories,
  };
}
