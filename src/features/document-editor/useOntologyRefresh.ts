/**
 * Detects ontology path drift from live dictionary layout and rebuilds segmentation on demand.
 * Full corpus segmentation runs asynchronously (never in render) so large dictionaries do not freeze the UI.
 */import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { yieldToMainThread } from '../../lib/corpusSegmentationCache';
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
  partialSegmentationAvailable: boolean;
  partialSegmentationProcessed: number;
  partialSegmentationTotal: number;
  runOntologyRefresh: (
    descriptions: string[],
    loadedRefs: LoadedDictionaryRef[],
    options?: {
      mode?: 'resume' | 'fresh';
      onProgress?: (current: number, total: number) => void;
      shouldCancel?: () => boolean;
    },
  ) => Promise<{ cancelled: boolean; savedEntryCount?: number }>;
  onCancelSegmentation?: () => void;
  onRefreshComplete?: (result: { cancelled: boolean; partialSaved?: boolean }) => void;
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
  partialSegmentationAvailable,
  partialSegmentationProcessed,
  partialSegmentationTotal,
  runOntologyRefresh,
  onCancelSegmentation,
  onRefreshComplete,
}: UseOntologyRefreshParams) {
  const [refreshingOntology, setRefreshingOntology] = useState(false);
  const [ontologyRefreshProgress, setOntologyRefreshProgress] = useState<OntologyRefreshProgress | null>(null);
  const [ontologyRefreshError, setOntologyRefreshError] = useState<string | null>(null);
  const [agentNeedsUpdate, setAgentNeedsUpdate] = useState(false);
  const [segmentationResumePromptOpen, setSegmentationResumePromptOpen] = useState(false);
  const [partialSaveNotice, setPartialSaveNotice] = useState<string | null>(null);
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
    onCancelSegmentation?.();
  }, [onCancelSegmentation]);

  const executeOntologyRefresh = useCallback(async (mode: 'resume' | 'fresh') => {
    if (refreshDescriptions.length === 0) return;

    const liveRefs = buildLiveLoadedRefs();
    if (liveRefs.length === 0) return;

    cancelRefreshRef.current = false;
    setOntologyRefreshError(null);
    setPartialSaveNotice(null);
    setRefreshingOntology(true);
    setOntologyRefreshProgress({
      current: mode === 'resume' ? partialSegmentationProcessed : 0,
      total: partialSegmentationTotal > 0 ? partialSegmentationTotal : refreshDescriptions.length,
      phase: 'segmentation',
    });
    await yieldToMainThread();
    await yieldToMainThread();

    try {
      const { cancelled, savedEntryCount } = await runOntologyRefresh(
        refreshDescriptions,
        liveRefs,
        {
          mode,
          onProgress: (current, total) => {
            setOntologyRefreshProgress({ current, total, phase: 'segmentation' });
          },
          shouldCancel: () => cancelRefreshRef.current,
        },
      );

      if (!cancelled) {
        setAgentNeedsUpdate(false);
        onRefreshComplete?.({ cancelled: false });
      } else {
        const savedCount = savedEntryCount ?? 0;
        const total = partialSegmentationTotal;
        if (savedCount > 0 && total > savedCount) {
          setPartialSaveNotice(
            `Progresso salvato (${savedCount.toLocaleString('it-IT')} / ${total.toLocaleString('it-IT')} testi unici).`,
          );
        }
        onRefreshComplete?.({ cancelled: true, partialSaved: savedCount > 0 });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ricrea ontologia fallita';
      setOntologyRefreshError(message);
      onRefreshComplete?.({ cancelled: true });
    } finally {
      setRefreshingOntology(false);
      setOntologyRefreshProgress(null);
    }
  }, [
    buildLiveLoadedRefs,
    refreshDescriptions,
    runOntologyRefresh,
    onRefreshComplete,
    partialSegmentationTotal,
  ]);

  const refreshOntology = useCallback(() => {
    if (partialSegmentationAvailable) {
      setSegmentationResumePromptOpen(true);
      return;
    }
    void executeOntologyRefresh('fresh');
  }, [partialSegmentationAvailable, executeOntologyRefresh]);

  const confirmSegmentationResume = useCallback((resume: boolean) => {
    setSegmentationResumePromptOpen(false);
    void executeOntologyRefresh(resume ? 'resume' : 'fresh');
  }, [executeOntologyRefresh]);

  const dismissSegmentationResumePrompt = useCallback(() => {
    setSegmentationResumePromptOpen(false);
  }, []);

  const dismissPartialSaveNotice = useCallback(() => {
    setPartialSaveNotice(null);
  }, []);

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
    ontologyRefreshError,
    dismissOntologyRefreshError: () => setOntologyRefreshError(null),
    partialSaveNotice,
    dismissPartialSaveNotice,
    segmentationResumePromptOpen,
    confirmSegmentationResume,
    dismissSegmentationResumePrompt,
    cancelOntologyRefresh,
    refreshOntology,
    buildLiveLoadedRefs,
    liveLoadedRefs,
    pathOrderingCategories,
  };
}
