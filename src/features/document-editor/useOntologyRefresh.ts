/**
 * Detects ontology path drift from live dictionary layout and rebuilds the tree on demand.
 * Full corpus segmentation runs asynchronously (never in render) so large dictionaries do not freeze the UI.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  mergeAllDictionarySessionsIntoLoadedRefs,
  mergeLoadedTokens,
  type LoadedDictionaryRef,
} from '../../lib/multiDictionarySegment';
import {
  resolveCorpusItemPaths,
  buildCorpusSegmentationInputFromLoadedRefs,
  type CorpusSegmentExclusions,
  type CorpusItemExclusions,
} from '../../lib/corpusItemPaths';
import {
  canonicalizedPathSetsEqual,
  getPathOrderingCategories,
  itemPathsNeedCanonicalizationFromLoadedRefs,
} from '../../lib/pathCanonicalize';
import { LARGE_DICTIONARY_TOKEN_THRESHOLD } from '../../lib/dictionaryLimits';
import type { OntologySyncPhase } from '../../lib/analysisTypes';
import type { TokenDictionary } from '../../lib/tokenDictionary';
import type { DictionaryPanelState } from '../../components/DocumentViewer/DictionaryPanel';
import type { UseProjectDictionariesResult } from '../../hooks/useProjectDictionaries';

export type AgentDictionaryContext = {
  dictionary: TokenDictionary;
  descriptions: string[];
  activeTokenCount: number;
};

export interface OntologyRefreshProgress {
  current: number;
  total: number;
  phase: OntologySyncPhase;
}

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
  corpusDescriptions: string[];
  dicts: UseProjectDictionariesResult;
  hasTaxonomy: boolean;
  generating: boolean;
  itemPaths: string[] | null | undefined;
  segmentExclusions?: CorpusSegmentExclusions;
  itemExclusions?: CorpusItemExclusions;
  syncTaxonomyFromLoadedRefsAsync: (
    descriptions: string[],
    loadedRefs: LoadedDictionaryRef[],
    options?: {
      onProgress?: (current: number, total: number) => void;
      onPhase?: (phase: OntologySyncPhase) => void;
      shouldCancel?: () => boolean;
    },
  ) => Promise<{ result: unknown; cancelled: boolean }>;
  onRefreshComplete?: (result: { cancelled: boolean }) => void;
}

function resolveRefreshDescriptions(
  dictState: DictionaryPanelState | null,
  agentDictionaryContext: AgentDictionaryContext | null,
  corpusDescriptions: string[],
): string[] {
  const fromPanel = dictState?.getDescriptions() ?? agentDictionaryContext?.descriptions;
  if (fromPanel?.some((d) => d.trim().length > 0)) return fromPanel;
  return corpusDescriptions;
}

function computeLeafPaths(
  descriptions: string[],
  loadedRefs: LoadedDictionaryRef[],
  segmentExclusions?: CorpusSegmentExclusions,
  itemExclusions?: CorpusItemExclusions,
): string[] {
  if (descriptions.length === 0 || loadedRefs.length === 0) return [];
  return resolveCorpusItemPaths(
    buildCorpusSegmentationInputFromLoadedRefs(descriptions, loadedRefs, segmentExclusions, itemExclusions),
  );
}

export function useOntologyRefresh({
  dictState,
  agentDictionaryContext,
  corpusDescriptions,
  dicts,
  hasTaxonomy,
  generating,
  itemPaths,
  segmentExclusions,
  itemExclusions,
  syncTaxonomyFromLoadedRefsAsync,
  onRefreshComplete,
}: UseOntologyRefreshParams) {
  const [refreshingOntology, setRefreshingOntology] = useState(false);
  const [ontologyRefreshProgress, setOntologyRefreshProgress] = useState<OntologyRefreshProgress | null>(null);
  const [agentNeedsUpdate, setAgentNeedsUpdate] = useState(false);
  const cancelRefreshRef = useRef(false);

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

  const refreshDescriptions = useMemo(
    () => resolveRefreshDescriptions(dictState, agentDictionaryContext, corpusDescriptions),
    [
      agentDictionaryContext?.descriptions,
      corpusDescriptions,
      dictState,
      dicts.dictionarySessionsRevision,
    ],
  );

  const activeTokenCount = useMemo(
    () => (liveLoadedRefs.length > 0 ? mergeLoadedTokens(liveLoadedRefs).length : 0),
    [liveLoadedRefs],
  );

  /** Cheap sync hint + deferred full path comparison (never blocks render). */
  useEffect(() => {
    if (!hasTaxonomy || liveLoadedRefs.length === 0) {
      setAgentNeedsUpdate(false);
      return;
    }

    if (itemPaths?.length && itemPathsNeedCanonicalizationFromLoadedRefs(itemPaths, liveLoadedRefs)) {
      setAgentNeedsUpdate(true);
      return;
    }

    if (refreshDescriptions.length === 0) {
      setAgentNeedsUpdate(false);
      return;
    }

    let cancelled = false;

    const applyResult = (needsUpdate: boolean) => {
      if (!cancelled) setAgentNeedsUpdate(needsUpdate);
    };

    const runFullCheck = () => {
      if (cancelled) return;
      try {
        const leafPaths = computeLeafPaths(refreshDescriptions, liveLoadedRefs, segmentExclusions, itemExclusions);
        if (leafPaths.length === 0) {
          applyResult(false);
          return;
        }
        applyResult(!ontologyPathsMatchSaved(leafPaths, itemPaths, liveLoadedRefs));
      } catch {
        applyResult(false);
      }
    };

    if (activeTokenCount > LARGE_DICTIONARY_TOKEN_THRESHOLD) {
      let idleId: number;
      if (typeof requestIdleCallback === 'function') {
        idleId = requestIdleCallback(runFullCheck, { timeout: 15_000 });
        return () => {
          cancelled = true;
          cancelIdleCallback(idleId);
        };
      }
      const timeoutId = window.setTimeout(runFullCheck, 250);
      return () => {
        cancelled = true;
        window.clearTimeout(timeoutId);
      };
    }

    const timeoutId = window.setTimeout(runFullCheck, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    hasTaxonomy,
    itemPaths,
    liveLoadedRefs,
    refreshDescriptions,
    activeTokenCount,
    dicts.dictionarySessionsRevision,
    segmentExclusions,
    itemExclusions,
  ]);

  const hasCorpusDescriptions = refreshDescriptions.some((d) => d.trim().length > 0);

  const ontologyRefreshDisabledReason = useMemo((): string | null => {
    if (generating) return 'Attendi il termine della generazione in corso.';
    if (liveLoadedRefs.length === 0) {
      return 'Carica o crea un dizionario di progetto (tab Dizionari).';
    }
    if (!hasCorpusDescriptions && !hasTaxonomy) {
      return 'Nel tab Documento originale imposta almeno una colonna come Selector o Descrizione.';
    }
    return null;
  }, [generating, liveLoadedRefs.length, hasCorpusDescriptions, hasTaxonomy]);

  const canRefreshOntology = ontologyRefreshDisabledReason === null && !refreshingOntology;

  const showOntologyRefreshButton = liveLoadedRefs.length > 0 && !generating;

  const cancelOntologyRefresh = useCallback(() => {
    cancelRefreshRef.current = true;
  }, []);

  const refreshOntology = useCallback(async () => {
    if (refreshDescriptions.length === 0) return;

    const liveRefs = buildLiveLoadedRefs();
    if (liveRefs.length === 0) return;

    cancelRefreshRef.current = false;
    setRefreshingOntology(true);
    setOntologyRefreshProgress({
      current: 0,
      total: refreshDescriptions.length,
      phase: 'segmentation',
    });

    try {
      const { cancelled } = await syncTaxonomyFromLoadedRefsAsync(
        refreshDescriptions,
        liveRefs,
        {
          onProgress: (current, total) => {
            setOntologyRefreshProgress({ current, total, phase: 'segmentation' });
          },
          onPhase: (phase) => {
            setOntologyRefreshProgress((prev) => (
              prev ? { ...prev, phase } : { current: 0, total: refreshDescriptions.length, phase }
            ));
          },
          shouldCancel: () => cancelRefreshRef.current,
        },
      );

      if (!cancelled) {
        setAgentNeedsUpdate(false);
      }
      onRefreshComplete?.({ cancelled });
    } catch {
      /* error surfaced via analysisApi.error */
      onRefreshComplete?.({ cancelled: true });
    } finally {
      setRefreshingOntology(false);
      setOntologyRefreshProgress(null);
    }
  }, [
    buildLiveLoadedRefs,
    refreshDescriptions,
    syncTaxonomyFromLoadedRefsAsync,
    onRefreshComplete,
  ]);

  const pathOrderingCategories = useMemo(
    () => (liveLoadedRefs.length > 0 ? getPathOrderingCategories(liveLoadedRefs) : []),
    [liveLoadedRefs],
  );

  return {
    agentNeedsUpdate,
    canRefreshOntology,
    showOntologyRefreshButton,
    ontologyRefreshDisabledReason,
    refreshingOntology,
    ontologyRefreshProgress,
    cancelOntologyRefresh,
    refreshOntology,
    buildLiveLoadedRefs,
    liveLoadedRefs,
    pathOrderingCategories,
  };
}
