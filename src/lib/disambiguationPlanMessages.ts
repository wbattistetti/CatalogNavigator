/**
 * Merges compiled plan nodes with saved message copy (grouped by signature).
 */
import type {
  DisambiguationMessageRecord,
  DisambiguationPlanNode,
  DisambiguationPlanResult,
  DisambiguationPlanStorage,
  DisambiguationQuestionStyle,
} from './disambiguationPlanTypes';
import {
  DISAMBIGUATION_MULTI_CHOICE_MARKER,
  DISAMBIGUATION_MULTI_CHOICE_THRESHOLD,
} from './disambiguationPlanTypes';
import { defaultNoMatchReplies } from './messageAssembly';
import { compileTurnAnswerGrammar } from './turnAnswerGrammar';

export interface DisambiguationEditorRow extends DisambiguationMessageRecord {
  nodeKeys: string[];
  sampleAcquired: Record<string, string>;
}

function styleLabel(style: DisambiguationQuestionStyle): string {
  switch (style) {
    case 'optional_include': return 'opzionale';
    case 'ask_age': return 'età';
    default: return 'scelta';
  }
}

function visibleOptions(options: string[]): string[] {
  return options.filter((o) => o !== 'none');
}

/** Human-readable option list (hides technical "none"). */
export function formatHumanOptions(
  options: string[],
  style: DisambiguationQuestionStyle,
): string {
  const visible = visibleOptions(options);
  if (style === 'optional_include') {
    return visible.length === 1 ? `includere «${visible[0]}»` : visible.join(' · ');
  }
  if (visible.length > DISAMBIGUATION_MULTI_CHOICE_THRESHOLD) {
    return `scelta libera (${visible.length} opzioni)`;
  }
  return visible.join(' · ');
}

/** Short label for a copy signature in prompts and UI. */
export function formatCopySignatureLabel(signature: string, categoryName: string): string {
  if (signature.includes(`||${DISAMBIGUATION_MULTI_CHOICE_MARKER}||`)) {
    return `${categoryName} (scelta aperta)`;
  }
  return signature;
}

/** Full technical option tokens for tooltips / debugging. */
export function formatTechnicalOptions(options: string[]): string {
  return [...options].sort((a, b) => a.localeCompare(b, 'it')).join(' · ');
}

/** Compiles turn-scoped answer grammar from plan option tokens. */
export function compileDisambiguationAnswerGrammar(options: string[]) {
  try {
    return compileTurnAnswerGrammar(options);
  } catch {
    return null;
  }
}

export function formatAcquiredContext(acquired: Record<string, string>): string {
  const entries = Object.entries(acquired);
  if (entries.length === 0) return '—';
  return entries.map(([k, v]) => `${k}=${v}`).join(', ');
}

/** Groups disambiguate nodes by signature for editor rows. */
export function buildDisambiguationEditorRows(
  plan: DisambiguationPlanResult,
  saved?: DisambiguationPlanStorage | null,
): DisambiguationEditorRow[] {
  const savedBySig = new Map(
    (saved?.messages ?? []).map((m) => [m.signature, m]),
  );

  const groups = new Map<string, {
    node: DisambiguationPlanNode;
    nodeKeys: string[];
    sampleAcquired: Record<string, string>;
  }>();

  for (const node of plan.nodes) {
    if (node.action !== 'disambiguate' || !node.categoryName || !node.options) continue;
    const sig = node.signature;
    const existing = groups.get(sig);
    if (existing) {
      existing.nodeKeys.push(node.key);
    } else {
      groups.set(sig, {
        node,
        nodeKeys: [node.key],
        sampleAcquired: node.acquired,
      });
    }
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'it'))
    .map(([signature, group]) => {
      const savedRow = savedBySig.get(signature);
      const { node, nodeKeys, sampleAcquired } = group;
      const question = savedRow?.question ?? null;
      const noMatch = question
        ? {
          no_match_1: savedRow?.no_match_1 ?? defaultNoMatchReplies(question).no_match_1,
          no_match_2: savedRow?.no_match_2 ?? defaultNoMatchReplies(question).no_match_2,
          no_match_3: savedRow?.no_match_3 ?? defaultNoMatchReplies(question).no_match_3,
        }
        : {
          no_match_1: savedRow?.no_match_1 ?? null,
          no_match_2: savedRow?.no_match_2 ?? null,
          no_match_3: savedRow?.no_match_3 ?? null,
        };

      return {
        signature,
        categoryName: node.categoryName!,
        options: node.options!,
        style: node.style ?? 'choice',
        question,
        ...noMatch,
        answer_grammar: savedRow?.answer_grammar ?? compileDisambiguationAnswerGrammar(node.options!),
        source: savedRow?.source,
        status: savedRow?.status ?? null,
        contextCount: nodeKeys.length,
        nodeKeys,
        sampleAcquired,
      };
    });
}

export function editorRowsToStorage(
  rows: DisambiguationEditorRow[],
  computedAt: string | null,
): DisambiguationPlanStorage {
  return {
    computedAt,
    messages: rows.map((row) => ({
      signature: row.signature,
      categoryName: row.categoryName,
      options: row.options,
      style: row.style,
      question: row.question,
      no_match_1: row.no_match_1,
      no_match_2: row.no_match_2,
      no_match_3: row.no_match_3,
      answer_grammar: row.answer_grammar ?? compileDisambiguationAnswerGrammar(row.options),
      source: row.source,
      status: row.status ?? null,
      contextCount: row.contextCount,
    })),
  };
}

/** Merges freshly computed rows into storage (keeps orphan signatures — legacy). */
export function mergeDisambiguationPlanStorage(
  rows: DisambiguationEditorRow[],
  computedAt: string | null,
  previous?: DisambiguationPlanStorage | null,
): DisambiguationPlanStorage {
  const next = editorRowsToStorage(rows, computedAt);
  const seen = new Set(next.messages.map((m) => m.signature));
  for (const msg of previous?.messages ?? []) {
    if (seen.has(msg.signature)) continue;
    if (!msg.question?.trim() && !msg.no_match_1?.trim()) continue;
    next.messages.push(msg);
    seen.add(msg.signature);
  }
  return next;
}

export interface DisambiguationMergeStats {
  total: number;
  reused: number;
  needsRewrite: number;
  droppedObsolete: number;
}

/** Counts how many messages were kept vs need IA after a recalculate. */
export function summarizeDisambiguationMerge(
  rows: DisambiguationEditorRow[],
  previous?: DisambiguationPlanStorage | null,
): DisambiguationMergeStats {
  const currentSigs = new Set(rows.map((r) => r.signature));
  const previousWithCopy = (previous?.messages ?? []).filter(
    (m) => m.question?.trim() || m.no_match_1?.trim(),
  );
  const reused = rows.filter((r) => r.question?.trim()).length;
  const needsRewrite = rows.filter((r) => !r.question?.trim()).length;
  const droppedObsolete = previousWithCopy.filter((m) => !currentSigs.has(m.signature)).length;
  return { total: rows.length, reused, needsRewrite, droppedObsolete };
}

/** Editor rows that still need question copy (for IA generation). */
export function rowsNeedingDisambiguationMessages(rows: DisambiguationEditorRow[]): DisambiguationEditorRow[] {
  return rows.filter((r) => !r.question?.trim());
}

/**
 * After Calcola: persist only current-plan signatures (drops obsolete copy).
 * Messages are merged by exact signature in buildDisambiguationEditorRows before this runs.
 */
export function mergeDisambiguationPlanAfterCompute(
  rows: DisambiguationEditorRow[],
  computedAt: string | null,
  previous?: DisambiguationPlanStorage | null,
): { storage: DisambiguationPlanStorage; stats: DisambiguationMergeStats } {
  return {
    storage: editorRowsToStorage(rows, computedAt),
    stats: summarizeDisambiguationMerge(rows, previous),
  };
}

function buildRestorePlanKey(
  documentId: string,
  analysisId: string,
  computedAt: string | null | undefined,
  filledCount: number,
): string {
  return `${documentId}:${analysisId}:${computedAt ?? ''}:${filledCount}`;
}

export { buildRestorePlanKey };

/** Updates one message copy field in the disambiguation plan (by signature). */
export function patchDisambiguationPlanMessage(
  plan: DisambiguationPlanStorage | null | undefined,
  signature: string,
  patch: Partial<Pick<DisambiguationMessageRecord, 'question' | 'no_match_1' | 'no_match_2' | 'no_match_3'>>,
): DisambiguationPlanStorage {
  const existing = plan?.messages ?? [];
  const index = existing.findIndex((m) => m.signature === signature);
  if (index < 0) {
    return {
      computedAt: plan?.computedAt ?? null,
      messages: existing,
    };
  }
  const messages = existing.map((m, i) => (
    i === index
      ? { ...m, ...patch, source: 'manual' as const }
      : m
  ));
  return { computedAt: plan?.computedAt ?? null, messages };
}

/** Minimal plan shell so saved messages are visible before/without full BFS recompute. */
export function buildPlanResultFromStorage(
  storage: DisambiguationPlanStorage,
): DisambiguationPlanResult | null {
  if (!storage.messages.length) return null;
  const nodes: DisambiguationPlanNode[] = storage.messages.map((m) => ({
    key: m.signature,
    signature: m.signature,
    acquired: {},
    ageYears: null,
    action: 'disambiguate',
    categoryName: m.categoryName,
    options: m.options,
    style: m.style,
    candidateCount: m.contextCount ?? 1,
    candidatePathsSample: [],
  }));
  return {
    nodes,
    stats: {
      catalogItemCount: 0,
      totalStates: 0,
      disambiguateNodes: nodes.length,
      askAgeNodes: 0,
      confirmStates: 0,
      deadStates: 0,
      stuckStates: 0,
      uniqueDisambiguationBySignature: nodes.length,
      uniqueDisambiguationByFullKey: nodes.length,
      uniqueAgePatterns: 0,
    },
    computedAt: storage.computedAt ?? new Date().toISOString(),
    warnings: ['Piano ripristinato dal salvataggio — premi Calcola per aggiornare statistiche e firme.'],
  };
}

export function hasSavedDisambiguationContent(
  storage?: DisambiguationPlanStorage | null,
): boolean {
  if (!storage) return false;
  if (storage.computedAt) return true;
  return storage.messages.some(
    (m) => m.question?.trim() || m.no_match_1?.trim() || m.no_match_2?.trim() || m.no_match_3?.trim(),
  );
}

export function resolveMessageForNode(
  node: DisambiguationPlanNode,
  storage: DisambiguationPlanStorage | null | undefined,
): Pick<DisambiguationMessageRecord, 'question' | 'no_match_1' | 'no_match_2' | 'no_match_3'> | null {
  if (node.action !== 'disambiguate') return null;
  const record = storage?.messages.find((m) => m.signature === node.signature);
  if (!record?.question?.trim()) return null;
  return {
    question: record.question,
    no_match_1: record.no_match_1,
    no_match_2: record.no_match_2,
    no_match_3: record.no_match_3,
  };
}

export { styleLabel };
