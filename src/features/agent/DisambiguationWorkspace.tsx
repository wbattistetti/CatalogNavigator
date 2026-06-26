/**

 * Disambiguation plan workspace: compute graph, edit messages, IA generation.

 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AlertTriangle, Calculator, Loader2, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react';

import {
  compileDisambiguationPlanAsync,
  type CompileDisambiguationPlanInput,
  type CompileDisambiguationPlanProgress,
} from '../../lib/compileDisambiguationPlan';

import type { DisambiguationPlanResult } from '../../lib/disambiguationPlanTypes';

import {

  buildDisambiguationEditorRows,

  editorRowsToStorage,

  mergeDisambiguationPlanAfterCompute,

  rowsNeedingDisambiguationMessages,

  type DisambiguationEditorRow,

  type DisambiguationMergeStats,

} from '../../lib/disambiguationPlanMessages';

import {
  buildCorpusSegmentationInputFromLoadedRefs,
  resolveCorpusItemPathsFromSegmentationCacheAsync,
} from '../../lib/corpusItemPaths';
import {
  buildDisambiguationPlanCompileInputAsync,
  canResolveDisambiguationCatalog,
  createAnalysisWithItemPathsForCompute,
  resolveDisambiguationCatalogCount,
  resolveDisambiguationComputeBlockReason,
  type BuildDisambiguationPreparingProgress,
} from '../../lib/buildDisambiguationPlanCompileInput';

import type { CorpusSegmentExclusions } from '../../lib/corpusItemPaths';

import { compileAgentBundle } from '../../lib/compileAgentBundle';
import { distinctCatalogOptionsForCategory } from '../../lib/catalogDisambiguationOptions';
import type { CorpusItemExclusions } from '../../lib/corpusItemPaths';

import type { Analysis } from '../../lib/analysisTypes';

import type { LoadedDictionaryRef } from '../../lib/multiDictionarySegment';

import type { TokenDictionary } from '../../lib/tokenDictionary';

import type { DisambiguationPlanStorage } from '../../lib/disambiguationPlanTypes';

import { applyDisambiguationComputeResultAsync } from '../../lib/applyDisambiguationComputeResult';

import { AgentGlobalMessagesStrip } from './AgentGlobalMessagesStrip';
import { DisambiguationMessagePanel } from './DisambiguationMessagePanel';
import { DisambiguationMessagesSplitPane } from './DisambiguationMessagesSplitPane';
import type { DisambiguationNavRequest } from '../document-editor/useDocumentEditorController';
import { DisambiguationComputeProgressOverlay, type DisambiguationComputePhase } from '../document-editor/DisambiguationProgressBar';
import { yieldToUi } from '../../lib/yieldToUi';
import { DICT_INPUT_FIELD } from '../dictionaries/dictionaryFormStyles';
import { useOntologyCorpusSegmentation } from '../ontology-corpus/OntologyCorpusSegmentationContext';
import type { AgentBundleCompileInput } from '../../lib/agentBundleTypes';

function messageListTextColor(status: DisambiguationEditorRow['status']): string {
  if (status === 'approved') return 'text-emerald-300/90';
  if (status === 'rejected') return 'text-red-300/80';
  return 'text-orange-300/85';
}



interface DisambiguationWorkspaceProps {

  analysis: Analysis | null;

  dictionary: TokenDictionary | null;

  descriptions: string[];

  loadedRefs: LoadedDictionaryRef[];

  dictionaryDirty?: boolean;

  analysisDirty?: boolean;

  pathsOutOfSync?: boolean;

  documentName: string;

  documentId: string;

  documentText?: string;

  generating?: boolean;

  leafDescriptionMap?: ReadonlyMap<string, string> | Record<string, string>;

  segmentExclusions?: CorpusSegmentExclusions;

  itemExclusions?: CorpusItemExclusions;

  onExcludeCorpusItem?: (sourceText: string) => void;

  onRestoreCorpusItem?: (sourceText: string) => void;

  onExcludeCorpusSegment?: (sourceText: string, segmentText: string) => void;

  onExcludeCorpusSegmentOccurrence?: (
    sourceText: string,
    segmentText: string,
    occurrenceIndex1Based: number,
  ) => void;

  onUpdatePlan: (plan: DisambiguationPlanStorage) => void;

  /** Persists catalog paths resolved during Calcola (from segmentation cache). */
  onCommitResolvedItemPaths?: (itemPaths: string[]) => void;

  plan: DisambiguationPlanResult | null;

  onPlanChange: (plan: DisambiguationPlanResult | null) => void;

  onGenerateMessages: (

    rows: DisambiguationEditorRow[],

    options?: { forceAll?: boolean; computedAt?: string | null },

  ) => Promise<void>;

  navRequest?: DisambiguationNavRequest | null;

  onNavRequestHandled?: () => void;

  onUpdateAgentConfig?: (updates: {
    start_question?: string | null;
    confirmation_preamble?: string | null;
  }) => void;

}



function PlanHeaderSubtitle({
  plan,
  editorRows,
  mergeStats,
}: {
  plan: DisambiguationPlanResult | null;
  editorRows: DisambiguationEditorRow[];
  mergeStats: DisambiguationMergeStats | null;
}) {
  if (!plan || editorRows.length === 0) {
    return (
      <p className="font-mono text-sm text-emerald-300/80 mt-0.5">
        Calcola il piano, poi genera o modifica i messaggi
      </p>
    );
  }

  const needsRewrite = mergeStats?.needsRewrite
    ?? editorRows.filter((r) => !r.question?.trim()).length;
  const droppedObsolete = mergeStats?.droppedObsolete ?? 0;

  return (
    <p className="font-mono text-sm text-emerald-300/80 mt-0.5">
      <span>{editorRows.length} messaggi</span>
      {needsRewrite > 0 && (
        <>
          <span className="text-emerald-400/60"> · </span>
          <span className="text-orange-300">{needsRewrite} da riscrivere</span>
        </>
      )}
      {droppedObsolete > 0 && (
        <>
          <span className="text-emerald-400/60"> · </span>
          <span className="text-emerald-300/75">{droppedObsolete} obsoleti rimossi</span>
        </>
      )}
    </p>
  );
}

function rowMatchesMessageFilter(row: DisambiguationEditorRow, query: string): boolean {
  const haystack = [
    row.question ?? '',
    row.categoryName,
    row.signature,
    ...row.options,
    row.no_match_1 ?? '',
    row.no_match_2 ?? '',
    row.no_match_3 ?? '',
  ].join(' ').toLowerCase();
  return haystack.includes(query);
}



async function runPlanCompile(
  buildInput: () => Promise<CompileDisambiguationPlanInput>,
  onProgress?: (progress: CompileDisambiguationPlanProgress) => void,
  shouldCancel?: () => boolean,
): Promise<DisambiguationPlanResult> {
  await yieldToUi();
  const input = await buildInput();
  return compileDisambiguationPlanAsync(input, { onProgress, shouldCancel });
}



export function DisambiguationWorkspace({

  analysis,

  dictionary,

  descriptions,

  loadedRefs,

  dictionaryDirty,

  analysisDirty,

  pathsOutOfSync,

  documentName,

  documentId,

  documentText,

  generating = false,

  leafDescriptionMap,

  segmentExclusions,

  itemExclusions,

  onExcludeCorpusItem,

  onRestoreCorpusItem,

  onExcludeCorpusSegment,

  onExcludeCorpusSegmentOccurrence,

  onUpdatePlan,

  onCommitResolvedItemPaths,

  plan,

  onPlanChange,

  onGenerateMessages,

  navRequest = null,

  onNavRequestHandled,

  onUpdateAgentConfig,

}: DisambiguationWorkspaceProps) {

  const [computing, setComputing] = useState(false);

  const [computePhase, setComputePhase] = useState<DisambiguationComputePhase | null>(null);

  const computeCancelRef = useRef(false);

  const [computeProgress, setComputeProgress] = useState<CompileDisambiguationPlanProgress | null>(null);

  const [preparingProgress, setPreparingProgress] = useState<BuildDisambiguationPreparingProgress | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [mergeStats, setMergeStats] = useState<DisambiguationMergeStats | null>(null);

  const [selectedSignature, setSelectedSignature] = useState<string | null>(null);

  const [messageFilter, setMessageFilter] = useState('');

  const [focusGrammar, setFocusGrammar] = useState(false);

  const segmentation = useOntologyCorpusSegmentation();

  useEffect(() => {
    if (!navRequest?.signature) return;
    setSelectedSignature(navRequest.signature);
    setFocusGrammar(navRequest.focusGrammar ?? false);
    onNavRequestHandled?.();
  }, [navRequest?.signature, navRequest?.focusGrammar, onNavRequestHandled]);



  const canCompute = !!(
    canResolveDisambiguationCatalog(
      analysis,
      pathsOutOfSync ?? false,
      segmentation.cache,
      descriptions,
    )
    && dictionary?.categories?.length
    && descriptions.some((line) => line.trim().length > 0)
  );

  const computeBlockReason = resolveDisambiguationComputeBlockReason(
    analysis,
    dictionary,
    descriptions,
    pathsOutOfSync ?? false,
    segmentation.cache,
  );



  const buildAgentBundleInput = useCallback((activeAnalysis: Analysis): AgentBundleCompileInput => {

    if (!dictionary) {

      throw new Error('Dizionario mancante.');

    }

    return {

      documentName,

      documentId,

      dictionary,

      descriptions,

      analysis: activeAnalysis,

      loadedRefs: loadedRefs.length > 0 ? loadedRefs : undefined,

      leafDescriptionMap,

      dictionaryDirty,

      analysisDirty,

      pathsOutOfSync,

      segmentExclusions,

      itemExclusions,

    };

  }, [

    dictionary,

    descriptions,

    documentName,

    documentId,

    loadedRefs,

    leafDescriptionMap,

    dictionaryDirty,

    analysisDirty,

    pathsOutOfSync,

    segmentExclusions,

    itemExclusions,

  ]);



  const resolveActiveAnalysis = useCallback(async (): Promise<Analysis> => {
    if (!pathsOutOfSync && analysis && (analysis.item_paths?.some((p) => p.trim()) ?? false)) {
      return analysis;
    }

    await yieldToUi();

    if (loadedRefs.length === 0) {
      throw new Error('Monta almeno un dizionario nel progetto prima di calcolare il piano.');
    }

    const segInput = buildCorpusSegmentationInputFromLoadedRefs(
      descriptions,
      loadedRefs,
      segmentExclusions,
      itemExclusions,
    );

    const itemPaths = await resolveCorpusItemPathsFromSegmentationCacheAsync(
      segInput,
      segmentation.cache,
      (processed, total) => setPreparingProgress({ phase: 'paths', processed, total }),
    );

    if (itemPaths.length === 0) {
      throw new Error('Nessun path catalogo dalla segmentazione corpus.');
    }

    return createAnalysisWithItemPathsForCompute(documentId, itemPaths, analysis);
  }, [
    pathsOutOfSync,
    analysis,
    descriptions,
    loadedRefs,
    segmentExclusions,
    itemExclusions,
    documentId,
    segmentation.cache,
  ]);

  const buildPlanCompileInput = useCallback(
    (activeAnalysis: Analysis) => buildDisambiguationPlanCompileInputAsync(
      buildAgentBundleInput(activeAnalysis),
      {
        pathsOutOfSync,
        segmentationCache: segmentation.cache,
        onPreparing: setPreparingProgress,
      },
    ),
    [buildAgentBundleInput, pathsOutOfSync, segmentation.cache],
  );

  const vincoloCategories = useMemo(
    () => (dictionary?.categories ?? []).filter((c) => c.type === 'vincolo'),
    [dictionary?.categories],
  );

  const dictionaryCategories = useMemo(
    () => dictionary?.categories ?? [],
    [dictionary?.categories],
  );

  useEffect(() => {
    setMergeStats(null);
    setSelectedSignature(null);
    setError(null);
    setMessageFilter('');
  }, [documentId]);

  useEffect(() => {
    if (!plan || !analysis?.disambiguation_plan) {
      setMergeStats(null);
      return;
    }
    const rows = buildDisambiguationEditorRows(plan, analysis.disambiguation_plan, dictionaryCategories);
    setMergeStats(summarizeFromRows(rows, analysis.disambiguation_plan));
  }, [plan, analysis?.disambiguation_plan, dictionaryCategories]);

  const editorRows = useMemo(() => {

    if (!plan) return [];

    return buildDisambiguationEditorRows(plan, analysis?.disambiguation_plan, dictionaryCategories);

  }, [plan, analysis?.disambiguation_plan, dictionaryCategories]);



  const rowsToGenerate = useMemo(

    () => rowsNeedingDisambiguationMessages(editorRows),

    [editorRows],

  );



  const selectedRow = useMemo(

    () => editorRows.find((r) => r.signature === selectedSignature) ?? null,

    [editorRows, selectedSignature],

  );

  const selectedVincoloCategory = useMemo(
    () => vincoloCategories.find((c) => c.name === selectedRow?.categoryName) ?? null,
    [vincoloCategories, selectedRow?.categoryName],
  );

  const selectedRuntimeOptions = useMemo(() => {
    if (!selectedRow || !analysis || !dictionary) return undefined;
    if (selectedRow.candidatePaths.length === 0) return undefined;
    try {
      const bundle = compileAgentBundle({
        documentName,
        documentId,
        dictionary,
        descriptions,
        analysis,
        loadedRefs: loadedRefs.length > 0 ? loadedRefs : undefined,
        segmentExclusions,
        itemExclusions,
      });
      const keys = distinctCatalogOptionsForCategory(
        bundle,
        selectedRow.categoryName,
        selectedRow.candidatePaths,
      );
      return keys.length > 0 ? keys : undefined;
    } catch {
      return undefined;
    }
  }, [
    selectedRow,
    analysis,
    dictionary,
    documentName,
    documentId,
    descriptions,
    loadedRefs,
    segmentExclusions,
    itemExclusions,
  ]);



  const filteredRows = useMemo(() => {
    const query = messageFilter.trim().toLowerCase();
    if (!query) return editorRows;
    return editorRows.filter((row) => rowMatchesMessageFilter(row, query));
  }, [editorRows, messageFilter]);

  useEffect(() => {
    setMessageFilter('');
  }, [plan?.computedAt]);



  const handleCancelCompute = useCallback(() => {
    computeCancelRef.current = true;
  }, []);



  const handleCompute = useCallback(() => {

    if (!dictionary) return;

    setComputing(true);

    setComputePhase('preparing');

    setComputeProgress(null);

    setPreparingProgress(null);

    setError(null);

    setMergeStats(null);

    computeCancelRef.current = false;



    void (async () => {

      await yieldToUi();

      try {

        const activeAnalysis = await resolveActiveAnalysis();

        if (computeCancelRef.current) return;

        const result = await runPlanCompile(

          () => buildPlanCompileInput(activeAnalysis),

          (progress) => {
            setComputePhase('bfs');
            setComputeProgress(progress);
          },

          () => computeCancelRef.current,

        );

        if (computeCancelRef.current) return;

        setComputePhase('finalizing');

        setComputeProgress(null);

        await yieldToUi();

        const { storage, stats } = await applyDisambiguationComputeResultAsync(

          result,

          activeAnalysis.disambiguation_plan,

          dictionaryCategories,

        );

        if (computeCancelRef.current) return;

        onUpdatePlan(storage);

        onPlanChange(result);

        setMergeStats(stats);

        if (activeAnalysis.item_paths?.length) {
          onCommitResolvedItemPaths?.(activeAnalysis.item_paths);
        }

      } catch (err) {

        if (err instanceof DOMException && err.name === 'AbortError') {
          setError('Calcolo piano annullato.');
          return;
        }

        setError(err instanceof Error ? err.message : String(err));

      } finally {

        setPreparingProgress(null);

        setComputing(false);

        setComputePhase(null);

        setComputeProgress(null);

        computeCancelRef.current = false;

      }

    })();

  }, [
    dictionary,
    resolveActiveAnalysis,
    buildPlanCompileInput,
    dictionaryCategories,
    onUpdatePlan,
    onPlanChange,
    onCommitResolvedItemPaths,
  ]);



  const handleGenerateAi = useCallback(async (forceAll = false) => {

    if (!plan || editorRows.length === 0) return;

    const targets = forceAll ? editorRows : rowsToGenerate;

    if (targets.length === 0) return;

    setError(null);

    try {

      await onGenerateMessages(editorRows, {

        forceAll,

        computedAt: plan.computedAt,

      });

    } catch (err) {

      setError(err instanceof Error ? err.message : String(err));

    }

  }, [plan, editorRows, rowsToGenerate, onGenerateMessages]);



  const handleSaveRow = useCallback((signature: string, patch: Partial<DisambiguationEditorRow>) => {

    if (!plan) return;

    const nextRows = editorRows.map((row) =>

      row.signature === signature ? { ...row, ...patch } : row,

    );

    onUpdatePlan(editorRowsToStorage(nextRows, plan.computedAt));

  }, [plan, editorRows, onUpdatePlan]);



  const catalogCount = useMemo(

    () => resolveDisambiguationCatalogCount(

      analysis?.item_paths,

      pathsOutOfSync ?? false,

      segmentation.cache,

      descriptions,

    ),

    [analysis?.item_paths, pathsOutOfSync, segmentation.cache, descriptions],

  );



  return (

    <div className="relative flex flex-col h-full min-h-0 bg-[#0a0f0c]">

      <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[#1a3a2a] bg-[#0a1510]">

        <div>

          <h2 className="font-mono text-sm font-bold text-emerald-300 tracking-wide uppercase">

            Messaggi dialogo

          </h2>

          <PlanHeaderSubtitle
            plan={plan}
            editorRows={editorRows}
            mergeStats={mergeStats}
          />

        </div>

        <div className="flex items-center gap-2 flex-wrap">

          <button

            type="button"

            onClick={handleCompute}

            disabled={!canCompute || computing || generating}

            className="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-emerald-400/40 bg-emerald-400/10 text-emerald-300 font-mono text-sm hover:bg-emerald-400/20 disabled:opacity-40 transition-colors"

          >

            {computing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Calculator className="w-3.5 h-3.5" />}

            Calcola

          </button>

          {plan && editorRows.length > 0 && (

            <button

              type="button"

              onClick={() => void handleGenerateAi(false)}

              disabled={generating || computing || rowsToGenerate.length === 0}

              title={rowsToGenerate.length === 0

                ? 'Tutti i messaggi del piano sono già compilati'

                : `Genera solo i ${rowsToGenerate.length} messaggi da scrivere`}

              className="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-sky-400/40 bg-sky-400/10 text-sky-300 font-mono text-sm hover:bg-sky-400/20 disabled:opacity-40 transition-colors"

            >

              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}

              Genera messaggi IA

              {rowsToGenerate.length > 0 && (

                <span className="tabular-nums text-sky-200/70">({rowsToGenerate.length})</span>

              )}

            </button>

          )}

        </div>

      </div>

      {onUpdateAgentConfig && (
        <AgentGlobalMessagesStrip
          startQuestion={analysis?.start_question ?? null}
          confirmationPreamble={analysis?.confirmation_preamble ?? null}
          disabled={!analysis}
          onUpdate={onUpdateAgentConfig}
        />
      )}

      {error && (

        <div className="flex-shrink-0 mx-4 mt-3 rounded border border-red-400/40 bg-red-400/10 px-4 py-2 font-mono text-sm text-red-300">

          {error}

        </div>

      )}



      {!canCompute && computeBlockReason && (

        <div className="p-4">

          <div className="rounded border border-amber-400/30 bg-amber-400/5 px-4 py-3 font-mono text-sm text-amber-300/90">

            {computeBlockReason}

          </div>

        </div>

      )}



      {plan && !computing && (

        <DisambiguationMessagesSplitPane
          list={(
            <div className="flex flex-col h-full min-h-0">
              <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-[#1a3a2a] bg-[#0a1510]">

                <p className="font-mono text-sm uppercase tracking-wide text-emerald-300/80 flex-shrink-0">

                  Messaggi

                </p>

                <input

                  type="search"

                  value={messageFilter}

                  onChange={(e) => setMessageFilter(e.target.value)}

                  onKeyDown={(e) => e.stopPropagation()}

                  placeholder="Filtra per parola…"

                  aria-label="Filtra messaggi disambiguazione"

                  className={`${DICT_INPUT_FIELD} flex-1 min-w-0 py-1.5 text-sm bg-[#080e0a] placeholder:text-emerald-400/55`}

                />

                {messageFilter.trim() && (

                  <span className="font-mono text-sm text-emerald-300/75 tabular-nums flex-shrink-0">

                    {filteredRows.length}/{editorRows.length}

                  </span>

                )}

              </div>



              <div className="flex-1 min-h-0 overflow-y-auto">

                {filteredRows.length === 0 ? (

                  <p className="px-3 py-4 font-mono text-sm text-emerald-300/75 italic">

                    {editorRows.length === 0
                      ? 'Nessun messaggio nel piano.'
                      : 'Nessun messaggio corrisponde al filtro.'}

                  </p>

                ) : (

                <ul className="divide-y divide-[#1a3a2a]/50">

                  {filteredRows.map((row) => {

                    const selected = row.signature === selectedSignature;

                    const hasQuestion = !!row.question?.trim();

                    return (

                      <li key={row.signature} className="group">

                        <div

                          role="button"

                          tabIndex={0}

                          onClick={() => {
                            setFocusGrammar(false);
                            setSelectedSignature(row.signature);
                          }}

                          onKeyDown={(e) => {

                            if (e.key === 'Enter' || e.key === ' ') {

                              e.preventDefault();

                              setFocusGrammar(false);
                              setSelectedSignature(row.signature);

                            }

                          }}

                          className={`flex items-start gap-2 w-full text-left px-3 py-2.5 font-mono text-sm transition-colors cursor-pointer ${

                            selected

                              ? 'bg-emerald-400/10'

                              : 'hover:bg-emerald-400/5'

                          }`}

                        >

                          <span className={`flex-1 min-w-0 break-words whitespace-normal leading-relaxed transition-colors ${

                            hasQuestion ? messageListTextColor(row.status) : 'text-amber-300/90 italic'

                          }`}>

                            {hasQuestion ? row.question : '— da scrivere'}

                          </span>

                        {hasQuestion && (

                          <span

                            className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"

                            onClick={(e) => e.stopPropagation()}

                            onKeyDown={(e) => e.stopPropagation()}

                          >

                            <button

                              type="button"

                              title="Validato"

                                  onMouseDown={(e) => e.preventDefault()}

                                  onClick={() => handleSaveRow(row.signature, {

                                    status: row.status === 'approved' ? null : 'approved',

                                  })}

                                  className={`p-0.5 rounded transition-colors ${

                                    row.status === 'approved'

                                      ? 'text-emerald-400'

                                      : 'text-emerald-400/40 hover:text-emerald-400'

                                  }`}

                                >

                                  <ThumbsUp className="w-3.5 h-3.5" />

                                </button>

                                <button

                                  type="button"

                                  title="Da aggiustare"

                                  onMouseDown={(e) => e.preventDefault()}

                                  onClick={() => handleSaveRow(row.signature, {

                                    status: row.status === 'rejected' ? null : 'rejected',

                                  })}

                                  className={`p-0.5 rounded transition-colors ${

                                    row.status === 'rejected'

                                      ? 'text-red-400'

                                      : 'text-red-400/40 hover:text-red-400'

                                  }`}

                                >

                                  <ThumbsDown className="w-3.5 h-3.5" />

                            </button>

                          </span>

                        )}

                        </div>

                      </li>

                    );

                })}

              </ul>

            )}

            </div>



            {plan.warnings.length > 0 && (

              <ul className="flex-shrink-0 px-3 py-2 border-t border-[#1a3a2a] space-y-0.5 font-mono text-sm text-amber-300/90 max-h-24 overflow-auto">

                {plan.warnings.map((w) => (

                  <li key={w} className="flex items-start gap-1">

                    <AlertTriangle className="w-3 h-3 flex-shrink-0" />

                    {w}

                  </li>

                ))}

              </ul>

            )}

            </div>
          )}
          detail={(
            <DisambiguationMessagePanel
              row={selectedRow}
              categories={dictionaryCategories}
              vincoloCategory={selectedVincoloCategory}
              focusGrammar={focusGrammar}
              runtimeOptions={selectedRuntimeOptions}
              onSave={handleSaveRow}
            />
          )}
        />

      )}



      {!plan && canCompute && !error && !computing && (

        <p className="p-4 font-mono text-sm text-emerald-300/80">

          {catalogCount > 0

            ? `${catalogCount} prestazioni — premi Calcola per aprire l'editor.`

            : 'Premi Calcola per analizzare il piano.'}

        </p>

      )}



      {computing && computePhase && (
        <DisambiguationComputeProgressOverlay
          phase={computePhase}
          progress={computeProgress}
          preparingDetail={
            preparingProgress
              ? preparingProgress.phase === 'paths'
                ? `Path catalogo ${preparingProgress.processed.toLocaleString('it-IT')} / ${preparingProgress.total.toLocaleString('it-IT')}`
                : `Prestazioni ${preparingProgress.processed.toLocaleString('it-IT')} / ${preparingProgress.total.toLocaleString('it-IT')}`
              : undefined
          }
          preparingPercent={
            preparingProgress && preparingProgress.total > 0
              ? (preparingProgress.processed / preparingProgress.total) * 100
              : undefined
          }
          onCancel={handleCancelCompute}
        />
      )}

    </div>

  );

}



function summarizeFromRows(

  rows: DisambiguationEditorRow[],

  previous?: DisambiguationPlanStorage | null,

): DisambiguationMergeStats {

  return mergeDisambiguationPlanAfterCompute(rows, null, previous).stats;

}


