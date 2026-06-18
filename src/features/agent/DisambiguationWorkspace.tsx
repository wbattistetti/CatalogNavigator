/**

 * Disambiguation plan workspace: compute graph, edit messages, IA generation.

 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AlertTriangle, Calculator, Loader2, Sparkles } from 'lucide-react';

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

import { catalogItemPaths } from '../../lib/itemPaths';

import { compileAgentBundle } from '../../lib/compileAgentBundle';

import type { Analysis } from '../../lib/analysisTypes';

import type { LoadedDictionaryRef } from '../../lib/multiDictionarySegment';

import type { TokenDictionary } from '../../lib/tokenDictionary';

import type { DisambiguationPlanStorage } from '../../lib/disambiguationPlanTypes';

import { yieldToUi } from '../../lib/yieldToUi';

import { DisambiguationMessagePanel } from './DisambiguationMessagePanel';



interface DisambiguationWorkspaceProps {

  analysis: Analysis | null;

  dictionary: TokenDictionary | null;

  loadedRefs: LoadedDictionaryRef[];

  dictionaryDirty?: boolean;

  analysisDirty?: boolean;

  pathsOutOfSync?: boolean;

  documentName: string;

  documentId: string;

  documentText?: string;

  generating?: boolean;

  leafDescriptionMap?: ReadonlyMap<string, string> | Record<string, string>;

  onUpdatePlan: (plan: DisambiguationPlanStorage) => void;

  onGenerateMessages: (

    rows: DisambiguationEditorRow[],

    options?: { forceAll?: boolean; computedAt?: string | null },

  ) => Promise<void>;

}



function formatComputedAt(iso: string): string {

  return new Date(iso).toLocaleString('it-IT', {

    dateStyle: 'short',

    timeStyle: 'short',

  });

}



function StatRow({ label, value, highlight }: { label: string; value: number | string; highlight?: boolean }) {

  return (

    <div className={`flex items-baseline justify-between gap-4 py-1.5 border-b border-[#1a3a2a]/60 last:border-0 ${highlight ? 'text-emerald-200' : ''}`}>

      <span className="font-mono text-xs text-emerald-400/70">{label}</span>

      <span className={`font-mono text-xs tabular-nums ${highlight ? 'text-emerald-300 font-bold' : 'text-emerald-200/90'}`}>

        {value}

      </span>

    </div>

  );

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

  loadedRefs,

  dictionaryDirty,

  analysisDirty,

  pathsOutOfSync,

  documentName,

  documentId,

  documentText,

  generating = false,

  leafDescriptionMap,

  onUpdatePlan,

  onGenerateMessages,

}: DisambiguationWorkspaceProps) {

  const [plan, setPlan] = useState<DisambiguationPlanResult | null>(null);

  const [computing, setComputing] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [mergeStats, setMergeStats] = useState<DisambiguationMergeStats | null>(null);

  const [selectedSignature, setSelectedSignature] = useState<string | null>(null);

  const restoredPlanKeyRef = useRef<string | null>(null);



  const canCompute = !!(analysis?.rows?.length && analysis.item_paths?.length && dictionary?.categories?.length);



  const compilePlan = useCallback((): DisambiguationPlanResult => {

    if (!analysis || !dictionary) {

      throw new Error('Analisi o dizionario mancante.');

    }

    const bundle = compileAgentBundle({

      documentName,

      documentId,

      dictionary,

      descriptions: [],

      analysis,

      loadedRefs: loadedRefs.length > 0 ? loadedRefs : undefined,

      leafDescriptionMap,

      dictionaryDirty,

      analysisDirty,

      pathsOutOfSync,

    });

    return compileDisambiguationPlan({

      itemPaths: bundle.itemPaths,

      categories: bundle.dictionary.categories,

      corpusItems: bundle.corpusItems,

    });

  }, [

    analysis,

    dictionary,

    documentName,

    documentId,

    loadedRefs,

    leafDescriptionMap,

    dictionaryDirty,

    analysisDirty,

    pathsOutOfSync,

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

        const rows = buildDisambiguationEditorRows(result, analysis.disambiguation_plan);

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

  }, [canCompute, analysis?.disambiguation_plan, savedPlanKey, compilePlan]);



  const editorRows = useMemo(() => {

    if (!plan) return [];

    return buildDisambiguationEditorRows(plan, analysis?.disambiguation_plan);

  }, [plan, analysis?.disambiguation_plan]);



  const rowsToGenerate = useMemo(

    () => rowsNeedingDisambiguationMessages(editorRows),

    [editorRows],

  );



  const selectedRow = useMemo(

    () => editorRows.find((r) => r.signature === selectedSignature) ?? null,

    [editorRows, selectedSignature],

  );



  const filledCount = editorRows.filter((r) => r.question?.trim()).length;



  const applyComputeResult = useCallback((

    result: DisambiguationPlanResult,

    previousPlan: DisambiguationPlanStorage | null | undefined,

  ) => {

    const rows = buildDisambiguationEditorRows(result, previousPlan);

    const { storage, stats } = mergeDisambiguationPlanAfterCompute(

      rows,

      result.computedAt,

      previousPlan,

    );

    onUpdatePlan(storage);

    setPlan(result);

    setMergeStats(stats);

    const mergedRows = buildDisambiguationEditorRows(result, storage);

    const filled = mergedRows.filter((r) => r.question?.trim()).length;

    restoredPlanKeyRef.current = buildRestorePlanKey(

      documentId,

      analysis?.id ?? '',

      result.computedAt,

      filled,

    );

  }, [analysis?.id, documentId, onUpdatePlan]);



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



  const slots = useMemo(

    () => analysis?.rows.map((r) => r.slot_filling) ?? [],

    [analysis?.rows],

  );

  const catalogCount = useMemo(() => {

    if (!analysis?.item_paths?.length) return 0;

    return catalogItemPaths(slots, analysis.item_paths, dictionary?.categories).length;

  }, [analysis?.item_paths, slots, dictionary?.categories]);



  return (

    <div className="relative flex flex-col h-full min-h-0 bg-[#0a0f0c]">

      <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[#1a3a2a] bg-[#0a1510]">

        <div>

          <h2 className="font-mono text-sm font-bold text-emerald-300 tracking-wide uppercase">

            Piano disambiguazione

          </h2>

          <p className="font-mono text-xs text-emerald-400/50 mt-0.5">

            {plan

              ? `${filledCount}/${editorRows.length} messaggi compilati`

              : 'Calcola il piano, poi genera o modifica i messaggi'}

          </p>

        </div>

        <div className="flex items-center gap-2 flex-wrap">

          <button

            type="button"

            onClick={handleCompute}

            disabled={!canCompute || computing || generating}

            className="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-emerald-400/40 bg-emerald-400/10 text-emerald-300 font-mono text-xs hover:bg-emerald-400/20 disabled:opacity-40 transition-colors"

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

              className="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-sky-400/40 bg-sky-400/10 text-sky-300 font-mono text-xs hover:bg-sky-400/20 disabled:opacity-40 transition-colors"

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



      {(dictionaryDirty || analysisDirty || pathsOutOfSync) && (

        <div className="flex-shrink-0 mx-4 mt-3 flex items-start gap-2 rounded border border-amber-400/30 bg-amber-400/5 px-3 py-2 font-mono text-xs text-amber-300/80">

          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />

          <span>Modifiche non salvate — salva l&apos;analisi per persistere anche i messaggi disambiguazione.</span>

        </div>

      )}



      {mergeStats && plan && (

        <div className="flex-shrink-0 mx-4 mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded border border-emerald-400/25 bg-emerald-400/5 px-3 py-2 font-mono text-xs text-emerald-200/85">

          <span><strong className="text-emerald-300">{mergeStats.reused}</strong> riusati</span>

          <span className="text-emerald-400/30">·</span>

          <span><strong className="text-amber-300">{mergeStats.needsRewrite}</strong> da riscrivere</span>

          {mergeStats.droppedObsolete > 0 && (

            <>

              <span className="text-emerald-400/30">·</span>

              <span><strong className="text-emerald-400/60">{mergeStats.droppedObsolete}</strong> obsoleti rimossi</span>

            </>

          )}

        </div>

      )}



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

          <div className="flex flex-col w-[55%] min-w-0 border-r border-[#1a3a2a]">

            <div className="flex-shrink-0 px-3 py-2 border-b border-[#1a3a2a] bg-[#0a1510]">

              <div className="grid grid-cols-2 gap-x-4 max-w-md">

                <StatRow

                  label="Messaggi unici (firma)"

                  value={plan.stats.uniqueDisambiguationBySignature}

                  highlight

                />

                <StatRow label="Situazioni dialogo" value={plan.stats.totalStates} />

              </div>

              <p className="font-mono text-[10px] text-emerald-400/40 mt-1">

                Calcolato: {formatComputedAt(plan.computedAt)}

              </p>

            </div>



            <div className="flex-1 min-h-0 overflow-auto">

              <div className="sticky top-0 bg-[#0a1510] z-10 px-3 py-2 border-b border-[#1a3a2a]">

                <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-400/50">

                  Messaggi

                </p>

              </div>



              <ul className="divide-y divide-[#1a3a2a]/50">

                {editorRows.map((row) => {

                  const selected = row.signature === selectedSignature;

                  const hasQuestion = !!row.question?.trim();

                  return (

                    <li key={row.signature}>

                      <button

                        type="button"

                        onClick={() => setSelectedSignature(row.signature)}

                        className={`w-full text-left px-3 py-2.5 font-mono text-xs transition-colors ${

                          selected

                            ? 'bg-emerald-400/10'

                            : 'hover:bg-emerald-400/5'

                        }`}

                      >

                        {hasQuestion ? (

                          <span className="text-emerald-200/85 line-clamp-3">{row.question}</span>

                        ) : (

                          <span className="text-amber-400/60 italic">— da scrivere</span>

                        )}

                        <span className="mt-1 flex flex-wrap items-center gap-1.5">

                          {!hasQuestion && (

                            <span className="text-[10px] text-amber-400/50 uppercase tracking-wide">nuovo</span>

                          )}

                          {row.source === 'ai' && hasQuestion && (

                            <span className="text-[10px] text-sky-400/60 uppercase tracking-wide">IA</span>

                          )}

                          {row.source === 'manual' && hasQuestion && (

                            <span className="text-[10px] text-emerald-400/45 uppercase tracking-wide">manuale</span>

                          )}

                        </span>

                      </button>

                    </li>

                  );

                })}

              </ul>

            </div>



            {plan.warnings.length > 0 && (

              <ul className="flex-shrink-0 px-3 py-2 border-t border-[#1a3a2a] space-y-0.5 font-mono text-[10px] text-amber-300/70 max-h-24 overflow-auto">

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

            <DisambiguationMessagePanel row={selectedRow} onSave={handleSaveRow} />

          </div>

        </div>

      )}



      {!plan && canCompute && !error && !computing && (

        <p className="p-4 font-mono text-sm text-emerald-400/40">

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


