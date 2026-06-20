/**

 * Disambiguation plan workspace: compute graph, edit messages, IA generation.

 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AlertTriangle, Calculator, Loader2, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react';

import { compileDisambiguationPlan } from '../../lib/compileDisambiguationPlan';

import type { DisambiguationPlanResult } from '../../lib/disambiguationPlanTypes';

import {

  buildDisambiguationEditorRows,

  buildPlanResultFromStorage,

  buildRestorePlanKey,

  editorRowsToStorage,

  hasSavedDisambiguationContent,

  mergeDisambiguationPlanAfterCompute,

  rowsNeedingDisambiguationMessages,

  type DisambiguationEditorRow,

  type DisambiguationMergeStats,

} from '../../lib/disambiguationPlanMessages';

import { resolveCorpusItemPaths } from '../../lib/corpusItemPaths';

import type { CorpusSegmentExclusions } from '../../lib/corpusItemPaths';

import { compileAgentBundle } from '../../lib/compileAgentBundle';
import { distinctCatalogOptionsForCategory } from '../../lib/catalogDisambiguationOptions';
import type { CorpusItemExclusions } from '../../lib/corpusItemPaths';

import type { Analysis } from '../../lib/analysisTypes';

import type { LoadedDictionaryRef } from '../../lib/multiDictionarySegment';

import type { TokenDictionary } from '../../lib/tokenDictionary';

import type { DisambiguationPlanStorage } from '../../lib/disambiguationPlanTypes';

import { yieldToUi } from '../../lib/yieldToUi';

import { DisambiguationMessagePanel } from './DisambiguationMessagePanel';
import type { DisambiguationNavRequest } from '../document-editor/useDocumentEditorController';
import { DICT_INPUT_FIELD } from '../dictionaries/dictionaryFormStyles';

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

  onGenerateMessages: (

    rows: DisambiguationEditorRow[],

    options?: { forceAll?: boolean; computedAt?: string | null },

  ) => Promise<void>;

  navRequest?: DisambiguationNavRequest | null;

  onNavRequestHandled?: () => void;

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

  compilePlan: () => DisambiguationPlanResult,

): Promise<DisambiguationPlanResult> {

  await yieldToUi();

  return compilePlan();

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

  onGenerateMessages,

  navRequest = null,

  onNavRequestHandled,

}: DisambiguationWorkspaceProps) {

  const [plan, setPlan] = useState<DisambiguationPlanResult | null>(null);

  const [computing, setComputing] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [mergeStats, setMergeStats] = useState<DisambiguationMergeStats | null>(null);

  const [selectedSignature, setSelectedSignature] = useState<string | null>(null);

  const [messageFilter, setMessageFilter] = useState('');

  const [focusGrammar, setFocusGrammar] = useState(false);

  const restoredPlanKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!navRequest?.signature) return;
    setSelectedSignature(navRequest.signature);
    setFocusGrammar(navRequest.focusGrammar ?? false);
    onNavRequestHandled?.();
  }, [navRequest?.signature, navRequest?.focusGrammar, onNavRequestHandled]);



  const canCompute = !!(
    analysis?.rows?.length
    && dictionary?.categories?.length
    && descriptions.some((line) => line.trim().length > 0)
  );



  const compilePlan = useCallback((): DisambiguationPlanResult => {

    if (!analysis || !dictionary) {

      throw new Error('Analisi o dizionario mancante.');

    }

    const bundle = compileAgentBundle({

      documentName,

      documentId,

      dictionary,

      descriptions,

      analysis,

      loadedRefs: loadedRefs.length > 0 ? loadedRefs : undefined,

      leafDescriptionMap,

      dictionaryDirty,

      analysisDirty,

      pathsOutOfSync,

      segmentExclusions,

      itemExclusions,

    });

    return compileDisambiguationPlan({

      itemPaths: bundle.itemPaths,

      categories: bundle.dictionary.categories,

      corpusItems: bundle.corpusItems,

    });

  }, [

    analysis,

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



  const savedPlanKey = useMemo(() => {

    const msgs = analysis?.disambiguation_plan?.messages ?? [];

    const filled = msgs.filter((m) => m.question?.trim()).length;

    return buildRestorePlanKey(

      documentId,

      analysis?.id ?? '',

      analysis?.disambiguation_plan?.computedAt,

      filled,

    );

  }, [documentId, analysis?.id, analysis?.disambiguation_plan]);



  const vincoloCategories = useMemo(
    () => (dictionary?.categories ?? []).filter((c) => c.type === 'vincolo'),
    [dictionary?.categories],
  );

  const dictionaryCategories = useMemo(
    () => dictionary?.categories ?? [],
    [dictionary?.categories],
  );



  useEffect(() => {

    restoredPlanKeyRef.current = null;

    setPlan(null);

    setMergeStats(null);

    setSelectedSignature(null);

    setError(null);

  }, [documentId]);



  useEffect(() => {

    if (!canCompute || !analysis?.disambiguation_plan) return;

    if (!hasSavedDisambiguationContent(analysis.disambiguation_plan)) return;

    if (restoredPlanKeyRef.current === savedPlanKey) return;



    let cancelled = false;

    restoredPlanKeyRef.current = savedPlanKey;

    setComputing(true);

    setError(null);



    void (async () => {

      try {

        const result = await runPlanCompile(compilePlan);

        if (cancelled) return;

        setPlan(result);

        const rows = buildDisambiguationEditorRows(result, analysis.disambiguation_plan, dictionaryCategories);

        setMergeStats(summarizeFromRows(rows, analysis.disambiguation_plan));

      } catch (err) {

        if (cancelled) return;

        const fallback = buildPlanResultFromStorage(analysis.disambiguation_plan!);

        if (fallback) {

          setPlan(fallback);

        } else {

          setError(err instanceof Error ? err.message : String(err));

        }

      } finally {

        if (!cancelled) setComputing(false);

      }

    })();



    return () => {

      cancelled = true;

    };

  }, [canCompute, analysis?.disambiguation_plan, savedPlanKey, compilePlan, dictionaryCategories]);



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



  const applyComputeResult = useCallback((

    result: DisambiguationPlanResult,

    previousPlan: DisambiguationPlanStorage | null | undefined,

  ) => {

    const rows = buildDisambiguationEditorRows(result, previousPlan, dictionaryCategories);

    const { storage, stats } = mergeDisambiguationPlanAfterCompute(

      rows,

      result.computedAt,

      previousPlan,

    );

    onUpdatePlan(storage);

    setPlan(result);

    setMergeStats(stats);

    const mergedRows = buildDisambiguationEditorRows(result, storage, dictionaryCategories);

    const filled = mergedRows.filter((r) => r.question?.trim()).length;

    restoredPlanKeyRef.current = buildRestorePlanKey(

      documentId,

      analysis?.id ?? '',

      result.computedAt,

      filled,

    );

  }, [analysis?.id, documentId, onUpdatePlan, dictionaryCategories]);



  const handleCompute = useCallback(() => {

    if (!analysis || !dictionary) return;

    setComputing(true);

    setError(null);

    setMergeStats(null);



    void (async () => {

      try {

        const result = await runPlanCompile(compilePlan);

        applyComputeResult(result, analysis.disambiguation_plan);

      } catch (err) {

        setPlan(null);

        setError(err instanceof Error ? err.message : String(err));

      } finally {

        setComputing(false);

      }

    })();

  }, [analysis, dictionary, compilePlan, applyComputeResult]);



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



  const catalogCount = useMemo(() => {
    if (!dictionary || descriptions.every((line) => !line.trim())) return 0;
    try {
      return resolveCorpusItemPaths({
        descriptions,
        dictionary,
        loadedRefs: loadedRefs.length > 0 ? loadedRefs : undefined,
        segmentExclusions,
      }).length;
    } catch {
      return 0;
    }
  }, [descriptions, dictionary, loadedRefs, segmentExclusions]);



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



      {error && (

        <div className="flex-shrink-0 mx-4 mt-3 rounded border border-red-400/40 bg-red-400/10 px-4 py-2 font-mono text-sm text-red-300">

          {error}

        </div>

      )}



      {!canCompute && (

        <div className="p-4">

          <div className="rounded border border-amber-400/30 bg-amber-400/5 px-4 py-3 font-mono text-sm text-amber-300/90">

            Genera l&apos;ontologia e monta il dizionario prima di calcolare il piano.

          </div>

        </div>

      )}



      {plan && (

        <div className="flex flex-1 min-h-0 overflow-hidden">

          <div className="flex flex-col flex-1 min-h-0 w-[55%] min-w-0 border-r border-[#1a3a2a]">

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

                        <span className={`flex-1 min-w-0 line-clamp-3 transition-colors ${

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



          <div className="flex-1 min-w-0 min-h-0 bg-[#0a0f0c]">

            <DisambiguationMessagePanel
              row={selectedRow}
              vincoloCategory={selectedVincoloCategory}
              focusGrammar={focusGrammar}
              runtimeOptions={selectedRuntimeOptions}
              onSave={handleSaveRow}
            />

          </div>

        </div>

      )}



      {!plan && canCompute && !error && !computing && (

        <p className="p-4 font-mono text-sm text-emerald-300/80">

          {hasSavedDisambiguationContent(analysis?.disambiguation_plan)

            ? 'Ripristino piano salvato…'

            : catalogCount > 0

              ? `${catalogCount} prestazioni — premi Calcola per aprire l'editor.`

              : 'Premi Calcola per analizzare il piano.'}

        </p>

      )}



      {computing && (

        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0a0f0c]/75 backdrop-blur-[1px]">

          <div className="flex flex-col items-center gap-3 rounded-lg border border-emerald-400/30 bg-[#0a1510] px-8 py-6 shadow-lg">

            <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />

            <p className="font-mono text-sm text-emerald-200">Calcolo piano disambiguazione…</p>

          </div>

        </div>

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


