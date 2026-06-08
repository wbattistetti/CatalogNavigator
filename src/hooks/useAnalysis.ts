import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  collectSubtreeSlots,
  findInvalidInternalNodes,
  hasAgentContent,
  indexRowsBySlot,
  mergeSubtreeRows,
  normalizeSlotPath,
  restructureSlotPath,
} from '../lib/analysisTree';
import {
  runGenerateAgent,
  runGenerateTaxonomy,
  runRefineTaxonomy,
  runRegenSubtree,
} from '../lib/runAnalyzeDocument';

export interface GrammarEntry {
  regex: string;
  mappings: Record<string, string>;
}

export type RowStatus = 'approved' | 'rejected' | 'uncertain' | null;

export type GeneratingPhase = 'taxonomy' | 'agent' | null;

export interface AnalysisRow {
  slot_filling: string;
  question: string | null;
  grammar: GrammarEntry | null;
  no_match_1: string | null;
  no_match_2: string | null;
  no_match_3: string | null;
  status?: RowStatus;
}

export interface Analysis {
  id: string;
  document_id: string;
  rows: AnalysisRow[];
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

async function persistRows(documentId: string, rows: AnalysisRow[]): Promise<Analysis> {
  await supabase.from('kb_analyses').delete().eq('document_id', documentId);
  const { data: inserted, error } = await supabase
    .from('kb_analyses')
    .insert({ document_id: documentId, rows })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return inserted as Analysis;
}

async function saveRows(analysisId: string, rows: AnalysisRow[]): Promise<void> {
  const { error } = await supabase.from('kb_analyses').update({ rows }).eq('id', analysisId);
  if (error) throw new Error(error.message);
}

export function useAnalysis(documentId: string) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingPhase, setGeneratingPhase] = useState<GeneratingPhase>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirtyRoots, setDirtyRoots] = useState<string[]>([]);
  const [regeningRoots, setRegeningRoots] = useState<string[]>([]);
  const [regenError, setRegenError] = useState<string | null>(null);

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
    setAnalysis(data ?? null);
  }, [documentId]);

  const generateTaxonomy = useCallback(async (documentText: string, documentName: string) => {
    setGenerating(true);
    setGeneratingPhase('taxonomy');
    setError(null);
    try {
      const rows = await runGenerateTaxonomy(documentText, documentName);
      const inserted = await persistRows(documentId, rows);
      setAnalysis(inserted);
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
    setGenerating(true);
    setGeneratingPhase('agent');
    setError(null);
    try {
      const slots = analysis.rows.map((r) => r.slot_filling);
      const rows = await runGenerateAgent(slots, documentName, documentText);

      const invalid = findInvalidInternalNodes(slots, rows);
      if (invalid.length > 0) {
        throw new Error(`Domande mancanti per: ${invalid.join(', ')}`);
      }

      const inserted = await persistRows(documentId, rows);
      setAnalysis(inserted);
      setDirtyRoots([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
      setGeneratingPhase(null);
    }
  }, [analysis, documentId]);

  const refineTaxonomy = useCallback(async (refinementNotes: string) => {
    if (!analysis) return;
    setGenerating(true);
    setGeneratingPhase('taxonomy');
    setError(null);
    try {
      const existingSlots = analysis.rows.map((r) => r.slot_filling);
      const rows = await runRefineTaxonomy(existingSlots, refinementNotes);
      const inserted = await persistRows(documentId, rows);
      setAnalysis(inserted);
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
    await saveRows(analysis.id, newRows);
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
    await saveRows(analysis.id, newRows);
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
      await saveRows(analysis.id, newRows);
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
    await saveRows(analysis.id, newRows);
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
      await saveRows(analysis.id, newRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [analysis]);

  const agentReady = analysis ? hasAgentContent(analysis.rows) : false;

  return {
    analysis, loading, generating, generatingPhase, error, regenError,
    agentReady,
    load, generateTaxonomy, generateAgent, refineTaxonomy,
    updateRow, deleteRow, addRow, restructurePath,
    dirtyRoots, regeningRoots, regenSubtree,
  };
}
