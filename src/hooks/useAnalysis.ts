import { useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  collectSubtreeSlots,
  expandLeafPathsToTree,
  findInvalidInternalNodes,
  getAgentGenerationRoots,
  extractLeafPaths,
  hasAgentContent,
  indexRowsBySlot,
  mergeSubtreeRows,
  normalizeSlotPath,
  restructureSlotPath,
} from '../lib/analysisTree';
import type { LeafConfirmationInput } from '../lib/confirmAiPostProcess';
import { runGenerateConfirmations } from '../lib/runGenerateConfirmations';
import {
  runGenerateTaxonomy,
  runRefineTaxonomy,
  runRegenSubtree,
} from '../lib/runAnalyzeDocument';
import { toTaxonomyRows } from '../lib/analyzeAiPostProcess';
import { segmentAllDescriptions, type TokenDictionary } from '../lib/tokenDictionary';

export interface GrammarEntry {
  regex: string;
  mappings: Record<string, string>;
}

export type RowStatus = 'approved' | 'rejected' | 'uncertain' | null;

export type GeneratingPhase = 'taxonomy' | 'agent' | null;

export interface AgentGenProgress {
  current: number;
  total: number;
  rootSlot: string;
}

export interface AnalysisRow {
  slot_filling: string;
  question: string | null;
  grammar: GrammarEntry | null;
  no_match_1: string | null;
  no_match_2: string | null;
  no_match_3: string | null;
  confirmation_text: string | null;
  status?: RowStatus;
}

export interface Analysis {
  id: string;
  document_id: string;
  rows: AnalysisRow[];
  start_question: string | null;
  confirmation_preamble: string | null;
  created_at: string;
  updated_at: string;
}

function findDirtyRoot(deletedSlot: string, remainingRows: AnalysisRow[]): string | null {
  const parts = deletedSlot.split('.');
  for (let i = parts.length - 1; i >= 1; i--) {
    const ancestor = parts.slice(0, i).join('.');
    if (remainingRows.some((r) => r.slot_filling === ancestor)) return ancestor;
  }
  return null;
}

async function persistAnalysis(documentId: string, analysis: Analysis): Promise<Analysis> {
  await supabase.from('kb_analyses').delete().eq('document_id', documentId);
  const { data: inserted, error } = await supabase
    .from('kb_analyses')
    .insert({
      document_id: documentId,
      rows: analysis.rows,
      start_question: analysis.start_question,
      confirmation_preamble: analysis.confirmation_preamble,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return inserted as Analysis;
}

function normalizeLoadedAnalysis(data: Analysis): Analysis {
  return {
    ...data,
    start_question: data.start_question ?? null,
    confirmation_preamble: data.confirmation_preamble ?? 'Quindi confermo:',
    rows: data.rows.map((r) => ({
      ...r,
      confirmation_text: r.confirmation_text ?? null,
    })),
  };
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Generazione annullata', 'AbortError');
}

function draftAnalysis(documentId: string, rows: AnalysisRow[], existing?: Analysis | null): Analysis {
  const now = new Date().toISOString();
  return {
    id: existing?.id ?? '',
    document_id: documentId,
    rows,
    start_question: existing?.start_question ?? null,
    confirmation_preamble: existing?.confirmation_preamble ?? 'Quindi confermo:',
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
}

export function useAnalysis(documentId: string) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analysisDirty, setAnalysisDirty] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingPhase, setGeneratingPhase] = useState<GeneratingPhase>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirtyRoots, setDirtyRoots] = useState<string[]>([]);
  const [regeningRoots, setRegeningRoots] = useState<string[]>([]);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [agentGenProgress, setAgentGenProgress] = useState<AgentGenProgress | null>(null);
  const [generatingConfirmations, setGeneratingConfirmations] = useState(false);
  const generationAbortRef = useRef<AbortController | null>(null);

  const beginGenerationAbort = useCallback((): AbortSignal => {
    generationAbortRef.current?.abort();
    const controller = new AbortController();
    generationAbortRef.current = controller;
    return controller.signal;
  }, []);

  const clearGenerationAbort = useCallback(() => {
    generationAbortRef.current = null;
  }, []);

  const cancelGeneration = useCallback(() => {
    generationAbortRef.current?.abort();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('kb_analyses')
      .select('*')
      .eq('document_id', documentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setLoading(false);
    if (err) { setError(err.message); return; }
    setAnalysis(data ? normalizeLoadedAnalysis(data as Analysis) : null);
    setAnalysisDirty(false);
  }, [documentId]);

  const saveAnalysis = useCallback(async () => {
    if (!analysis || analysis.rows.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const persisted = await persistAnalysis(documentId, analysis);
      setAnalysis(normalizeLoadedAnalysis(persisted));
      setAnalysisDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setSaving(false);
    }
  }, [analysis, documentId]);

  const discardAnalysisChanges = useCallback(async () => {
    await load();
  }, [load]);

  const updateAgentConfig = useCallback((updates: {
    start_question?: string | null;
    confirmation_preamble?: string | null;
  }) => {
    if (!analysis) return;
    setAnalysis({ ...analysis, ...updates });
    setAnalysisDirty(true);
  }, [analysis]);

  /** Generates discursive confirmation_text for leaf rows (separate IA pass from NLU). */
  const generateConfirmations = useCallback(async (
    leafDescriptions?: Map<string, string> | null,
  ) => {
    if (!analysis) return;
    const slots = analysis.rows.map((r) => r.slot_filling);
    const leaves = extractLeafPaths(slots);
    if (leaves.length === 0) throw new Error('Nessuna foglia nell\'albero');

    const items: LeafConfirmationInput[] = leaves.map((slot) => ({
      slot_filling: slot,
      description: leafDescriptions?.get(slot)?.trim()
        || slot.replace(/\./g, ' ').replace(/_/g, ' '),
    }));

    setGeneratingConfirmations(true);
    setError(null);
    try {
      const confirmations = await runGenerateConfirmations(items);
      const newRows = analysis.rows.map((row) => {
        const text = confirmations.get(row.slot_filling);
        if (!text) return row;
        return { ...row, confirmation_text: text };
      });
      setAnalysis({ ...analysis, rows: newRows });
      setAnalysisDirty(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setGeneratingConfirmations(false);
    }
  }, [analysis]);

  /** Generates NLU per forest root (or first-level branch), merging incrementally into rows. */
  const generateNluByRootChunks = useCallback(async (
    taxonomyRows: AnalysisRow[],
    documentName: string,
    documentText: string,
    existing: Analysis | null,
    signal?: AbortSignal,
  ): Promise<AnalysisRow[]> => {
    const allSlots = taxonomyRows.map((r) => r.slot_filling);
    const roots = getAgentGenerationRoots(allSlots);
    if (roots.length === 0) throw new Error('Nessuna radice nell\'albero');

    let currentRows = taxonomyRows;
    setAnalysis(draftAnalysis(documentId, currentRows, existing));
    setAnalysisDirty(true);

    for (let i = 0; i < roots.length; i++) {
      throwIfAborted(signal);
      const rootSlot = roots[i]!;
      setAgentGenProgress({ current: i + 1, total: roots.length, rootSlot });
      setRegeningRoots([rootSlot]);

      const subtreeSlots = collectSubtreeSlots(currentRows, rootSlot);
      const regenRows = await runRegenSubtree(
        subtreeSlots,
        rootSlot,
        documentName,
        documentText,
        signal,
      );

      throwIfAborted(signal);

      const invalid = findInvalidInternalNodes(subtreeSlots, regenRows);
      if (invalid.length > 0) {
        throw new Error(`Domande mancanti per ${rootSlot}: ${invalid.join(', ')}`);
      }

      const regenedBySlot = indexRowsBySlot(regenRows);
      currentRows = mergeSubtreeRows(currentRows, regenedBySlot, rootSlot);
      setAnalysis(draftAnalysis(documentId, currentRows, existing));
    }

    return currentRows;
  }, [documentId]);

  /**
   * Builds tree from dictionary segmentation (deterministic only).
   * NLU / IA disattivata temporaneamente — usare generateAgent in Slot Filling dopo.
   */
  const createAgentFromDictionary = useCallback(async (
    dictionary: TokenDictionary,
    descriptions: string[],
    _documentName: string,
    _documentText?: string,
  ) => {
    setGenerating(true);
    setGeneratingPhase('taxonomy');
    setError(null);
    try {
      const { leafPaths } = segmentAllDescriptions(descriptions, dictionary.tokens);
      if (leafPaths.length === 0) {
        throw new Error('Nessuna descrizione segmentata con il dizionario corrente');
      }
      const allSlots = expandLeafPathsToTree(leafPaths);
      if (allSlots.length === 0) throw new Error('Espansione albero fallita');

      const taxonomyRows = toTaxonomyRows(allSlots);
      setAnalysis((prev) => draftAnalysis(documentId, taxonomyRows, prev));
      setAnalysisDirty(true);
      setDirtyRoots([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setGenerating(false);
      setGeneratingPhase(null);
    }
  }, [documentId]);

  /** Deterministic tree from dictionary, then IA messages + grammars in one flow. */
  const generateFullAgentFromDictionary = useCallback(async (
    dictionary: TokenDictionary,
    descriptions: string[],
    documentName: string,
    documentText?: string,
  ) => {
    const signal = beginGenerationAbort();
    setGenerating(true);
    setGeneratingPhase('taxonomy');
    setError(null);
    try {
      throwIfAborted(signal);
      const { leafPaths } = segmentAllDescriptions(descriptions, dictionary.tokens);
      if (leafPaths.length === 0) {
        throw new Error('Nessuna descrizione segmentata con il dizionario corrente');
      }
      const allSlots = expandLeafPathsToTree(leafPaths);
      if (allSlots.length === 0) throw new Error('Espansione albero fallita');

      const taxonomyRows = toTaxonomyRows(allSlots);
      setGeneratingPhase('agent');
      await generateNluByRootChunks(
        taxonomyRows,
        documentName,
        documentText ?? '',
        analysis,
        signal,
      );
      setDirtyRoots([]);
    } catch (e) {
      if (!isAbortError(e)) setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setRegeningRoots([]);
      setAgentGenProgress(null);
      setGenerating(false);
      setGeneratingPhase(null);
      clearGenerationAbort();
    }
  }, [documentId, analysis, generateNluByRootChunks, beginGenerationAbort, clearGenerationAbort]);

  /** IA taxonomy from plain text, then messages + grammars. */
  const generateFullAgentFromText = useCallback(async (documentText: string, documentName: string) => {
    const signal = beginGenerationAbort();
    setGenerating(true);
    setGeneratingPhase('taxonomy');
    setError(null);
    try {
      throwIfAborted(signal);
      const taxonomyRows = await runGenerateTaxonomy(documentText, documentName, signal);
      setGeneratingPhase('agent');
      await generateNluByRootChunks(taxonomyRows, documentName, documentText, null, signal);
      setDirtyRoots([]);
    } catch (e) {
      if (!isAbortError(e)) setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setRegeningRoots([]);
      setAgentGenProgress(null);
      setGenerating(false);
      setGeneratingPhase(null);
      clearGenerationAbort();
    }
  }, [documentId, generateNluByRootChunks, beginGenerationAbort, clearGenerationAbort]);

  const generateTaxonomy = useCallback(async (documentText: string, documentName: string) => {
    setGenerating(true);
    setGeneratingPhase('taxonomy');
    setError(null);
    try {
      const rows = await runGenerateTaxonomy(documentText, documentName);
      setAnalysis((prev) => draftAnalysis(documentId, rows, prev));
      setAnalysisDirty(true);
      setDirtyRoots([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
      setGeneratingPhase(null);
    }
  }, [documentId]);

  const generateAgent = useCallback(async (documentText: string, documentName: string) => {
    if (!analysis) return;
    const signal = beginGenerationAbort();
    setGenerating(true);
    setGeneratingPhase('agent');
    setError(null);
    try {
      await generateNluByRootChunks(analysis.rows, documentName, documentText, analysis, signal);
      setDirtyRoots([]);
    } catch (e) {
      if (!isAbortError(e)) setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRegeningRoots([]);
      setAgentGenProgress(null);
      setGenerating(false);
      setGeneratingPhase(null);
      clearGenerationAbort();
    }
  }, [analysis, documentId, generateNluByRootChunks, beginGenerationAbort, clearGenerationAbort]);

  const refineTaxonomy = useCallback(async (refinementNotes: string) => {
    if (!analysis) return;
    setGenerating(true);
    setGeneratingPhase('taxonomy');
    setError(null);
    try {
      const existingSlots = analysis.rows.map((r) => r.slot_filling);
      const rows = await runRefineTaxonomy(existingSlots, refinementNotes);
      setAnalysis((prev) => draftAnalysis(documentId, rows, prev));
      setAnalysisDirty(true);
      setDirtyRoots([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
      setGeneratingPhase(null);
    }
  }, [analysis, documentId]);

  const updateRow = useCallback(async (rowIndex: number, updates: Partial<AnalysisRow>) => {
    if (!analysis) return;
    const newRows = analysis.rows.map((r, i) => i === rowIndex ? { ...r, ...updates } : r);
    if ('question' in updates) {
      const slot = analysis.rows[rowIndex]?.slot_filling;
      if (slot) setDirtyRoots((prev) => prev.includes(slot) ? prev : [...prev, slot]);
    }
    setAnalysis({ ...analysis, rows: newRows });
    setAnalysisDirty(true);
  }, [analysis]);

  const deleteRow = useCallback(async (rowIndex: number) => {
    if (!analysis) return;
    const slot = analysis.rows[rowIndex]?.slot_filling;
    if (!slot) return;
    const newRows = analysis.rows.filter(
      (r) => r.slot_filling !== slot && !r.slot_filling.startsWith(slot + '.'),
    );
    const dirty = findDirtyRoot(slot, newRows);
    if (dirty) {
      setDirtyRoots((prev) => (prev.includes(dirty) ? prev : [...prev, dirty]));
    }
    setAnalysis({ ...analysis, rows: newRows });
    setAnalysisDirty(true);
  }, [analysis]);

  const regenSubtree = useCallback(async (rootSlot: string, documentText: string, documentName: string) => {
    if (!analysis) return;
    setRegeningRoots((prev) => [...prev, rootSlot]);
    setRegenError(null);
    try {
      const slots = collectSubtreeSlots(analysis.rows, rootSlot);
      if (slots.length === 0) throw new Error('Nessuno slot nel sottoalbero da rigenerare');

      const regenRows = await runRegenSubtree(slots, rootSlot, documentName, documentText);

      if (regenRows.length === 0) {
        throw new Error('La rigenerazione non ha restituito righe valide');
      }

      const invalid = findInvalidInternalNodes(slots, regenRows);
      if (invalid.length > 0) {
        throw new Error(`Domande mancanti per: ${invalid.join(', ')}`);
      }

      const regenedBySlot = indexRowsBySlot(regenRows);
      const newRows = mergeSubtreeRows(analysis.rows, regenedBySlot, rootSlot);

      setAnalysis({ ...analysis, rows: newRows });
      setAnalysisDirty(true);
      setDirtyRoots((prev) => prev.filter((r) => r !== rootSlot));
    } catch (e) {
      setRegenError(e instanceof Error ? e.message : String(e));
    } finally {
      setRegeningRoots((prev) => prev.filter((r) => r !== rootSlot));
    }
  }, [analysis]);

  const addRow = useCallback(async (newSlot: string) => {
    if (!analysis) return;
    const newRow: AnalysisRow = {
      slot_filling: newSlot,
      question: null, grammar: null,
      no_match_1: null, no_match_2: null, no_match_3: null,
      confirmation_text: null,
      status: null,
    };
    const parentSlot = newSlot.split('.').slice(0, -1).join('.');
    const newRows = [...analysis.rows];
    let insertAfterIdx = -1;
    for (let i = 0; i < newRows.length; i++) {
      const r = newRows[i]!;
      if (r.slot_filling === parentSlot || r.slot_filling.startsWith(parentSlot + '.')) {
        insertAfterIdx = i;
      }
    }
    if (insertAfterIdx >= 0) {
      newRows.splice(insertAfterIdx + 1, 0, newRow);
    } else {
      newRows.push(newRow);
    }
    if (parentSlot) {
      setDirtyRoots((prev) => prev.includes(parentSlot) ? prev : [...prev, parentSlot]);
    }
    setAnalysis({ ...analysis, rows: newRows });
    setAnalysisDirty(true);
  }, [analysis]);

  const restructurePath = useCallback(async (rowIndex: number, newPathRaw: string) => {
    if (!analysis) return;
    const oldSlot = analysis.rows[rowIndex]?.slot_filling;
    if (!oldSlot) return;
    try {
      const newSlot = normalizeSlotPath(newPathRaw);
      if (newSlot === oldSlot) return;

      const newRows = restructureSlotPath(analysis.rows, oldSlot, newPathRaw);
      const parentNew = newSlot.split('.').slice(0, -1).join('.');
      const parentOld = oldSlot.split('.').slice(0, -1).join('.');

      setDirtyRoots((prev) => {
        let next = prev.map((s) => {
          if (s === oldSlot) return newSlot;
          if (s.startsWith(`${oldSlot}.`)) return newSlot + s.slice(oldSlot.length);
          return s;
        });
        for (const parent of [parentNew, parentOld]) {
          if (parent && !next.includes(parent)) next = [...next, parent];
        }
        return next;
      });

      setAnalysis({ ...analysis, rows: newRows });
      setAnalysisDirty(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [analysis]);

  const agentReady = analysis ? hasAgentContent(analysis.rows) : false;

  return {
    analysis, loading, saving, analysisDirty, generating, generatingPhase, agentGenProgress,
    generatingConfirmations, error, regenError,
    agentReady,
    load, saveAnalysis, discardAnalysisChanges, updateAgentConfig, generateConfirmations, cancelGeneration,
    generateTaxonomy, generateFullAgentFromText, createAgentFromDictionary, generateFullAgentFromDictionary, generateAgent, refineTaxonomy,
    updateRow, deleteRow, addRow, restructurePath,
    dirtyRoots, regeningRoots, regenSubtree,
  };
}
