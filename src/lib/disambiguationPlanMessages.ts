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
import type { TokenCategory } from './dictionaryTree';
import { deriveDisambiguationParents, type DisambiguationContextVariant, type DisambiguationParentInfo } from './disambiguationParents';
import { defaultNoMatchReplies } from './messageAssembly';
import { compileTurnAnswerGrammar } from './turnAnswerGrammar';
import { AGE_YEARS_QUESTION } from './constraintValidation';
import { normalizeTestPhrases } from './disambiguationTestPhrases';

export interface DisambiguationEditorRow extends DisambiguationMessageRecord {
  nodeKeys: string[];
  sampleAcquired: Record<string, string>;
  parentInfo: DisambiguationParentInfo;
  candidatePaths: string[];
  /** Distinct acquired situations merged under this signature. */
  contextVariants: DisambiguationContextVariant[];
}

/** Compact copy key for vincolo ask steps (one row per vincolo category). */
export function buildVincoloAskSignature(categoryName: string): string {
  return `vincolo||${categoryName.trim()}||ask`;
}

export function isVincoloAskSignature(signature: string): boolean {
  return signature.startsWith('vincolo||') && signature.endsWith('||ask');
}

function normalizeSavedSignature(
  signature: string,
  categoryName: string,
): string {
  if (signature === 'ask_age') return buildVincoloAskSignature(categoryName);
  return signature;
}

function styleLabel(style: DisambiguationQuestionStyle): string {
  switch (style) {
    case 'optional_include': return 'opzionale';
    case 'ask_age': return 'vincolo';
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
  if (style === 'ask_age') {
    return visible.length > 0
      ? `token catalogo: ${visible.join(' · ')}`
      : 'vincolo (nessun token)';
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
  return entries.map(([k, v]) => `${k}=${v}`).join(' · ');
}

function acquiredContextKey(acquired: Record<string, string>): string {
  return Object.entries(acquired)
    .sort(([a], [b]) => a.localeCompare(b, 'it'))
    .map(([k, v]) => `${k}=${v}`)
    .join('|');
}

function contextVariantKey(pathPrefix: string, acquired: Record<string, string>): string {
  return `${pathPrefix}||${acquiredContextKey(acquired)}`;
}

function addContextVariant(
  variants: DisambiguationContextVariant[],
  seen: Set<string>,
  acquired: Record<string, string>,
  pathPrefix: string,
): void {
  const trimmedPrefix = pathPrefix.trim();
  if (!trimmedPrefix) return;
  const key = contextVariantKey(trimmedPrefix, acquired);
  if (seen.has(key)) return;
  seen.add(key);
  variants.push({ pathPrefix: trimmedPrefix, acquired: { ...acquired } });
}

function addNodeContextVariants(
  variants: DisambiguationContextVariant[],
  seen: Set<string>,
  node: DisambiguationPlanNode,
  categories: TokenCategory[],
): void {
  const categoryName = node.categoryName?.trim();
  if (!categoryName) return;
  const paths = (node.candidatePathsSample ?? []).map((p) => p.trim()).filter(Boolean);
  const parentInfo = deriveDisambiguationParents(categoryName, paths, categories);
  const prefixes = parentInfo.contextPrefixes.filter((p) => p.trim());
  if (prefixes.length === 0) return;
  for (const prefix of prefixes) {
    addContextVariant(variants, seen, node.acquired ?? {}, prefix);
  }
}

function buildEditorRowFromGroup(
  signature: string,
  group: {
    node: DisambiguationPlanNode;
    nodeKeys: string[];
    sampleAcquired: Record<string, string>;
    candidatePaths: Set<string>;
    contextVariants: DisambiguationContextVariant[];
  },
  savedBySig: Map<string, DisambiguationMessageRecord>,
  categories: TokenCategory[],
  deferGrammarCompile = false,
): DisambiguationEditorRow {
  const savedRow = savedBySig.get(signature)
    ?? savedBySig.get('ask_age');
  const { node, nodeKeys, sampleAcquired } = group;
  const style = node.style ?? 'choice';
  const options = node.options ?? [];
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
    options,
    style,
    question,
    ...noMatch,
    answer_grammar: style === 'ask_age'
      ? null
      : (savedRow?.answer_grammar
        ?? (deferGrammarCompile ? null : compileDisambiguationAnswerGrammar(options))),
    test_phrases: normalizeTestPhrases(savedRow?.test_phrases),
    source: savedRow?.source,
    status: savedRow?.status ?? null,
    contextCount: nodeKeys.length,
    nodeKeys,
    sampleAcquired,
    parentInfo: deriveDisambiguationParents(
      node.categoryName!,
      [...group.candidatePaths],
      categories,
    ),
    candidatePaths: [...group.candidatePaths].sort((a, b) => a.localeCompare(b, 'it')),
    contextVariants: group.contextVariants.sort((a, b) => (
      a.pathPrefix.localeCompare(b.pathPrefix, 'it')
    )),
  };
}

/** Groups plan nodes by signature; merges vincolo categories from dictionary. */
export function buildDisambiguationEditorRows(
  plan: DisambiguationPlanResult,
  saved?: DisambiguationPlanStorage | null,
  categories: TokenCategory[] = [],
  options?: { deferGrammarCompile?: boolean },
): DisambiguationEditorRow[] {
  const deferGrammarCompile = options?.deferGrammarCompile ?? false;
  const vincoloCategories = categories.filter((c) => c.type === 'vincolo');
  const savedBySig = new Map<string, DisambiguationMessageRecord>();
  for (const message of saved?.messages ?? []) {
    const sig = normalizeSavedSignature(message.signature, message.categoryName);
    savedBySig.set(sig, { ...message, signature: sig });
  }

  const groups = new Map<string, {
    node: DisambiguationPlanNode;
    nodeKeys: string[];
    sampleAcquired: Record<string, string>;
    candidatePaths: Set<string>;
    contextVariants: DisambiguationContextVariant[];
    contextVariantSeen: Set<string>;
  }>();

  const addNodePaths = (group: { candidatePaths: Set<string> }, node: DisambiguationPlanNode) => {
    for (const path of node.candidatePathsSample ?? []) {
      const trimmed = path.trim();
      if (trimmed) group.candidatePaths.add(trimmed);
    }
  };

  const mergeNode = (group: {
    nodeKeys: string[];
    candidatePaths: Set<string>;
    contextVariants: DisambiguationContextVariant[];
    contextVariantSeen: Set<string>;
  }, node: DisambiguationPlanNode) => {
    group.nodeKeys.push(node.key);
    addNodePaths(group, node);
    addNodeContextVariants(group.contextVariants, group.contextVariantSeen, node, categories);
  };

  const createGroup = (node: DisambiguationPlanNode) => {
    const candidatePaths = new Set<string>();
    addNodePaths({ candidatePaths }, node);
    const contextVariants: DisambiguationContextVariant[] = [];
    const contextVariantSeen = new Set<string>();
    addNodeContextVariants(contextVariants, contextVariantSeen, node, categories);
    return {
      node,
      nodeKeys: [node.key],
      sampleAcquired: node.acquired,
      candidatePaths,
      contextVariants,
      contextVariantSeen,
    };
  };

  for (const node of plan.nodes) {
    if (node.action === 'disambiguate') {
      if (!node.categoryName || !node.options) continue;
      const sig = node.signature;
      const existing = groups.get(sig);
      if (existing) {
        mergeNode(existing, node);
      } else {
        groups.set(sig, createGroup(node));
      }
      continue;
    }

    if (node.action === 'ask_age' && node.categoryName) {
      const sig = isVincoloAskSignature(node.signature)
        ? node.signature
        : buildVincoloAskSignature(node.categoryName);
      const normalizedNode: DisambiguationPlanNode = {
        ...node,
        signature: sig,
        style: 'ask_age',
        options: node.options ?? [],
      };
      const existing = groups.get(sig);
      if (existing) {
        mergeNode(existing, normalizedNode);
      } else {
        groups.set(sig, createGroup(normalizedNode));
      }
    }
  }

  for (const category of vincoloCategories) {
    if (category.type !== 'vincolo') continue;
    const sig = buildVincoloAskSignature(category.name);
    if (groups.has(sig)) continue;
    groups.set(sig, {
      node: {
        key: sig,
        signature: sig,
        acquired: {},
        ageYears: null,
        action: 'ask_age',
        categoryName: category.name,
        options: [...(category.tokenTexts ?? [])],
        style: 'ask_age',
        candidateCount: 0,
        candidatePathsSample: [],
      },
      nodeKeys: [],
      sampleAcquired: {},
      candidatePaths: new Set<string>(),
      contextVariants: [],
      contextVariantSeen: new Set<string>(),
    });
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'it'))
    .map(([signature, group]) => buildEditorRowFromGroup(
      signature,
      group,
      savedBySig,
      categories,
      deferGrammarCompile,
    ));
}

/** Default question copy for vincolo ask rows when none is saved. */
export function defaultVincoloAskQuestion(categoryName: string, valueKind?: string | null): string {
  if (valueKind === 'age_years') return AGE_YEARS_QUESTION;
  return `Quale valore per «${categoryName}»?`;
}

export function editorRowsToStorage(
  rows: DisambiguationEditorRow[],
  computedAt: string | null,
  options?: { deferGrammarCompile?: boolean },
): DisambiguationPlanStorage {
  const deferGrammarCompile = options?.deferGrammarCompile ?? false;
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
      answer_grammar: row.style === 'ask_age'
        ? null
        : (row.answer_grammar
          ?? (deferGrammarCompile ? null : compileDisambiguationAnswerGrammar(row.options))),
      test_phrases: normalizeTestPhrases(row.test_phrases),
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
    storage: editorRowsToStorage(rows, computedAt, { deferGrammarCompile: true }),
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
  patch: Partial<Pick<
    DisambiguationMessageRecord,
    'question' | 'no_match_1' | 'no_match_2' | 'no_match_3' | 'answer_grammar'
  >>,
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
  const nodes: DisambiguationPlanNode[] = storage.messages.map((m) => {
    const sig = normalizeSavedSignature(m.signature, m.categoryName);
    const isVincolo = m.style === 'ask_age' || isVincoloAskSignature(sig);
    return {
      key: sig,
      signature: sig,
      acquired: {},
      ageYears: null,
      action: isVincolo ? 'ask_age' : 'disambiguate',
      categoryName: m.categoryName,
      options: m.options,
      style: m.style,
      candidateCount: m.contextCount ?? 1,
      candidatePathsSample: [],
    };
  });
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
