/**
 * Compiles the reachable disambiguation graph from catalog + dictionary categories.
 * Mirrors VB DialogEngine (CatalogFilter + AgentSlotMatch + ask_age) for plan BFS:
 * - corpus items include compiled vincolo age constraints (same as compileAgentBundle)
 * - bootstrap seeds from first attributo segment (post start_question implicit NLU)
 * - empty acquired → zero candidates; age filter uses total weeks like VB
 */
import type { BundleCorpusItem, CompiledAgeConstraint } from './agentBundleTypes';
import {
  ageYearsToTotalWeeks,
  filterPlanCandidates,
  planStateHasAcquiredAge,
} from './catalogFilterPlan';
import { pathSatisfiesAgeConstraintsFromTotalWeeks } from './constraintValidation';
import { buildCorpusItemsWithConstraints } from './corpusItemCompile';
import {
  buildDisambiguationNodeKey,
  buildPlanStateKey,
  buildQueueStateKey,
  planStateWithAgeAnswer,
  planStateWithDisambiguationPick,
  type PlanState,
} from './compileDisambiguationPlanState';
import { collectBootstrapSeedStates } from './planBootstrapSeeds';
import {
  DISAMBIGUATION_MULTI_CHOICE_MARKER,
  DISAMBIGUATION_MULTI_CHOICE_THRESHOLD,
  type DisambiguationAction,
  type DisambiguationPlanNode,
  type DisambiguationPlanResult,
  type DisambiguationPlanStats,
  type DisambiguationQuestionStyle,
} from './disambiguationPlanTypes';
import { normalizeCategoryOrders, type TokenCategory } from './dictionaryTree';
import { normalizeSlotCategoryKey } from './slotExtract';
import { buildVincoloAskSignature } from './disambiguationPlanMessages';
import { isAgeVincoloCategoryName } from './vincoloResolutionGrammar';
import {
  getItemAttributoValueSetKey,
  parseValueSetKey,
  valueSetContainsAll,
} from './valueSet';
import { yieldToMainThread } from './corpusSegmentationCache';

const MISSING_VALUE = 'none';

const DEFAULT_BFS_YIELD_EVERY = 8;
const DEFAULT_BFS_YIELD_MS = 16;
const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

/** FNV-1a hash for compact set fingerprints (order-independent via xor/sum). */
export function fnv32String(input: string): number {
  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

/** Compact fingerprint for a candidate path set — avoids sorting/joining thousands of paths. */
export function fingerprintCandidatePathSet(paths: readonly string[]): string {
  if (paths.length === 0) return '0:0:0';
  let xor = 0;
  let sum = 0;
  for (const path of paths) {
    const h = fnv32String(path);
    xor ^= h;
    sum = (sum + h) >>> 0;
  }
  return `${paths.length}:${xor.toString(36)}:${sum.toString(36)}`;
}

/** Live stats while BFS explores the disambiguation graph. */
export interface CompileDisambiguationPlanProgress {
  visitedStates: number;
  queueLength: number;
  decisionNodes: number;
  catalogItemCount: number;
  elapsedMs: number;
  statesPerSecond: number;
}

export interface CompileDisambiguationPlanAsyncOptions {
  onProgress?: (progress: CompileDisambiguationPlanProgress) => void;
  shouldCancel?: () => boolean;
  yieldEvery?: number;
}

export interface CompileDisambiguationPlanInput {
  itemPaths: string[];
  categories: TokenCategory[];
  corpusItems?: BundleCorpusItem[];
}

export {
  buildDisambiguationNodeKey,
  buildPlanStateKey,
  buildQueueStateKey,
} from './compileDisambiguationPlanState';
export type { PlanState } from './compileDisambiguationPlanState';

interface NextStepResult {
  action: DisambiguationAction;
  categoryName?: string;
  options?: string[];
  style?: DisambiguationQuestionStyle;
}

function sortedAcquiredEntries(acquired: Record<string, string>): [string, string][] {
  return Object.entries(acquired).sort(([a], [b]) => a.localeCompare(b, 'it'));
}

/**
 * BFS dedup key: same acquired slots + same surviving candidates = same situation.
 * Uses a compact path-set fingerprint instead of joining every catalog path.
 */
export function buildExplorationStateKey(
  acquired: Record<string, string>,
  candidatePaths: readonly string[],
  ageYears: number | null = null,
): string {
  const acq = sortedAcquiredEntries(acquired).map(([k, v]) => `${k}=${v}`).join('|');
  const agePart = ageYears != null ? `||age=${ageYears}` : '';
  return `${acq}${agePart}||${fingerprintCandidatePathSet(candidatePaths)}`;
}

function nonNoneOptions(options: string[]): string[] {
  return options.filter((o) => o !== MISSING_VALUE);
}

export function inferQuestionStyle(options: string[]): DisambiguationQuestionStyle {
  const values = nonNoneOptions(options);
  if (options.includes(MISSING_VALUE) && values.length === 1) {
    return 'optional_include';
  }
  return 'choice';
}

export function buildDisambiguationSignature(
  categoryName: string,
  options: string[],
): string {
  const style = inferQuestionStyle(options);
  const category = categoryName.trim();
  if (style === 'optional_include') {
    const value = nonNoneOptions(options)[0]!;
    return `${category}||${value}||${style}`;
  }
  const visible = nonNoneOptions(options);
  if (visible.length > DISAMBIGUATION_MULTI_CHOICE_THRESHOLD) {
    return `${category}||${DISAMBIGUATION_MULTI_CHOICE_MARKER}||${style}`;
  }
  const opts = [...options].sort((a, b) => a.localeCompare(b, 'it')).join('|');
  return `${category}||${opts}||${style}`;
}

/** True when copy is a generic open question for the category (many options). */
export function isMultiChoiceCopySignature(signature: string): boolean {
  return signature.includes(`||${DISAMBIGUATION_MULTI_CHOICE_MARKER}||`);
}

function getItemSegmentValue(
  item: BundleCorpusItem,
  categoryName: string,
  segmentKind: 'attributo' | 'vincolo',
): string {
  const key = normalizeSlotCategoryKey(categoryName);
  const seg = item.segments.find(
    (s) => s.categoryType === segmentKind && normalizeSlotCategoryKey(s.categoryName) === key,
  );
  const text = seg?.text?.trim();
  return text ? text : MISSING_VALUE;
}

function getItemAttributoValue(item: BundleCorpusItem, categoryName: string): string {
  return getItemAttributoValueSetKey(item, categoryName);
}

function isExactAttributoCategory(
  exactAttributoCategories: readonly string[],
  categoryName: string,
): boolean {
  return exactAttributoCategories.some(
    (c) => c.trim() && c.trim() === categoryName.trim(),
  );
}

function distinctAttributoValues(
  candidates: BundleCorpusItem[],
  categoryName: string,
): Set<string> {
  const values = new Set<string>();
  for (const item of candidates) {
    values.add(getItemAttributoValueSetKey(item, categoryName));
  }
  return values;
}

function distinctVincoloValues(
  candidates: BundleCorpusItem[],
  categoryName: string,
): Set<string> {
  const values = new Set<string>();
  for (const item of candidates) {
    values.add(getItemSegmentValue(item, categoryName, 'vincolo'));
  }
  return values;
}

function hasMeaningfulDistinctValues(values: Set<string>): boolean {
  if (values.size === 0) return false;
  if (values.size === 1 && values.has(MISSING_VALUE)) return false;
  return true;
}

/** Mirrors VB AgentSlotMatch.IsAttributoCategoryResolved — partial NLU stays unresolved. */
function isAttributoCategoryResolved(
  candidates: BundleCorpusItem[],
  acquired: Record<string, string>,
  categoryName: string,
  exactAttributoCategories: readonly string[],
): boolean {
  if (candidates.length <= 1) return true;

  const key = normalizeSlotCategoryKey(categoryName);
  const acquiredKey = acquired[key];
  if (acquiredKey == null) return false;

  const distinctKeys = distinctAttributoValues(candidates, categoryName);
  if (distinctKeys.size <= 1) return true;
  if (!distinctKeys.has(acquiredKey)) return false;

  if (isExactAttributoCategory(exactAttributoCategories, categoryName)) return true;

  const acquiredValues = parseValueSetKey(acquiredKey);
  for (const otherKey of distinctKeys) {
    if (otherKey === acquiredKey) continue;
    const otherValues = parseValueSetKey(otherKey);
    if (
      otherValues.length > acquiredValues.length &&
      valueSetContainsAll(otherValues, acquiredValues)
    ) {
      return false;
    }
  }
  return true;
}

function orderedAttributoCategories(
  categories: TokenCategory[],
  candidates: BundleCorpusItem[],
): TokenCategory[] {
  const names = new Set<string>();
  for (const item of candidates) {
    for (const seg of item.segments) {
      if (seg.categoryType !== 'vincolo' && seg.categoryName.trim()) {
        names.add(seg.categoryName.trim());
      }
    }
  }
  return normalizeCategoryOrders(categories).filter(
    (c) => c.type !== 'vincolo' && names.has(c.name),
  );
}

function orderedVincoloCategories(
  categories: TokenCategory[],
  candidates: BundleCorpusItem[],
): TokenCategory[] {
  const names = new Set<string>();
  for (const item of candidates) {
    for (const seg of item.segments) {
      if (seg.categoryType === 'vincolo' && seg.categoryName.trim()) {
        names.add(seg.categoryName.trim());
      }
    }
  }
  return normalizeCategoryOrders(categories).filter(
    (c) => c.type === 'vincolo' && names.has(c.name),
  );
}

function anyItemHasAgeConstraint(candidates: BundleCorpusItem[]): boolean {
  return candidates.some((item) =>
    item.constraints.some((c) => c.kind === 'age_years'),
  );
}

function hasUnresolvedAgeVincoloAmongCandidates(
  candidates: BundleCorpusItem[],
  acquired: Record<string, string>,
  categories: TokenCategory[],
): boolean {
  for (const category of orderedVincoloCategories(categories, candidates)) {
    const key = normalizeSlotCategoryKey(category.name);
    if (acquired[key] != null) continue;
    const values = distinctVincoloValues(candidates, category.name);
    if (hasMeaningfulDistinctValues(values)) return true;
  }
  return false;
}

function firstAgeVincoloCategory(categories: TokenCategory[]): TokenCategory | null {
  const vincoli = categories.filter((c) => c.type === 'vincolo');
  const age = vincoli.find((c) => c.valueKind === 'age_years' || isAgeVincoloCategoryName(c.name));
  return age ?? vincoli[0] ?? null;
}

function shouldAskAge(
  state: PlanState,
  candidates: BundleCorpusItem[],
  categories: TokenCategory[],
): boolean {
  if (planStateHasAcquiredAge(state)) return false;
  if (candidates.length <= 1) return false;
  if (anyItemHasAgeConstraint(candidates)) return true;
  return hasUnresolvedAgeVincoloAmongCandidates(candidates, state.acquired, categories);
}

function findDisambiguationTarget(
  candidates: BundleCorpusItem[],
  state: PlanState,
  categories: TokenCategory[],
): { categoryName: string; options: string[] } | null {
  for (const category of orderedAttributoCategories(categories, candidates)) {
    if (isAttributoCategoryResolved(
      candidates,
      state.acquired,
      category.name,
      state.exactAttributoCategories,
    )) continue;

    const values = distinctAttributoValues(candidates, category.name);
    if (values.size < 2) continue;

    const options = [...values].sort((a, b) => a.localeCompare(b, 'it'));
    return { categoryName: category.name, options };
  }
  return null;
}

function decideNextStep(
  state: PlanState,
  candidates: BundleCorpusItem[],
  categories: TokenCategory[],
): NextStepResult {
  if (candidates.length === 0) {
    return { action: 'dead' };
  }
  if (shouldAskAge(state, candidates, categories)) {
    const ageCat = firstAgeVincoloCategory(categories);
    const categoryName = ageCat?.name ?? 'fascia di età';
    const options = [...(ageCat?.tokenTexts ?? [])].sort((a, b) => a.localeCompare(b, 'it'));
    return { action: 'ask_age', style: 'ask_age', categoryName, options };
  }
  if (candidates.length === 1) {
    return { action: 'confirm' };
  }

  const target = findDisambiguationTarget(candidates, state, categories);
  if (target) {
    return {
      action: 'disambiguate',
      categoryName: target.categoryName,
      options: target.options,
      style: inferQuestionStyle(target.options),
    };
  }

  return { action: 'stuck' };
}

/** Age values that partition candidates by compiled age_years constraints. */
export function collectAgeProbeYears(candidates: BundleCorpusItem[]): number[] {
  const points = new Set<number>();
  for (const item of candidates) {
    for (const c of item.constraints) {
      if (c.kind !== 'age_years') continue;
      if (c.min != null) {
        points.add(Math.max(0, c.min));
        points.add(Math.max(0, c.min - 1));
      }
      if (c.max != null) {
        points.add(c.max);
        points.add(Math.min(120, c.max + 1));
      }
    }
  }
  if (points.size === 0) {
    return [5, 17, 30, 65];
  }
  return [...points].filter((a) => a >= 0 && a <= 120).sort((a, b) => a - b);
}

/**
 * After ask_age, expand BFS with ages that yield distinct candidate sets.
 * Without this, exploration stops at the root (totalStates = 1).
 */
export function expandAgeSuccessorStates(
  state: PlanState,
  candidates: BundleCorpusItem[],
): PlanState[] {
  const probeAges = collectAgeProbeYears(candidates);
  const seenCandidateSets = new Set<string>();
  const successors: PlanState[] = [];

  for (const age of probeAges) {
    const totalWeeks = ageYearsToTotalWeeks(age);
    const filtered = candidates.filter((item) =>
      pathSatisfiesAgeConstraintsFromTotalWeeks(totalWeeks, item.constraints as CompiledAgeConstraint[]),
    );
    if (filtered.length === 0) continue;
    const setKey = fingerprintCandidatePathSet(filtered.map((i) => i.path));
    if (seenCandidateSets.has(setKey)) continue;
    seenCandidateSets.add(setKey);
    successors.push(planStateWithAgeAnswer(state, age));
  }

  if (successors.length === 0 && candidates.length > 0) {
    successors.push(planStateWithAgeAnswer(state, 30));
  }

  return successors;
}

function samplePaths(paths: string[], max = 3): string[] {
  return paths.slice(0, max);
}

function buildStats(
  catalogItemCount: number,
  nodes: DisambiguationPlanNode[],
  stateCount: number,
  terminalCounts: Pick<
    DisambiguationPlanStats,
    'confirmStates' | 'deadStates' | 'stuckStates'
  >,
): DisambiguationPlanStats {
  const disambiguateNodes = nodes.filter((n) => n.action === 'disambiguate');
  const askAgeNodes = nodes.filter((n) => n.action === 'ask_age');
  const disambiguationSignatures = new Set(disambiguateNodes.map((n) => n.signature));
  const askAgeSignatures = new Set(askAgeNodes.map((n) => n.signature));

  return {
    catalogItemCount,
    totalStates: stateCount,
    disambiguateNodes: disambiguateNodes.length,
    askAgeNodes: askAgeNodes.length,
    confirmStates: terminalCounts.confirmStates,
    deadStates: terminalCounts.deadStates,
    stuckStates: terminalCounts.stuckStates,
    uniqueDisambiguationBySignature: disambiguationSignatures.size,
    uniqueDisambiguationByFullKey: disambiguateNodes.length,
    uniqueAgePatterns: askAgeSignatures.size,
  };
}

interface DisambiguationPlanBfsContext {
  corpusItems: BundleCorpusItem[];
  categories: TokenCategory[];
  catalogItemCount: number;
  itemPaths: string[];
  visitedStates: Set<string>;
  enqueuedQueueStates: Set<string>;
  decisionNodes: DisambiguationPlanNode[];
  seenDecisionKeys: Set<string>;
  queue: PlanState[];
  confirmStates: number;
  deadStates: number;
  stuckStates: number;
  bootstrapSeedCount: number;
}

function tryEnqueueState(ctx: DisambiguationPlanBfsContext, state: PlanState): void {
  const key = buildQueueStateKey(state);
  if (ctx.enqueuedQueueStates.has(key)) return;
  ctx.enqueuedQueueStates.add(key);
  ctx.queue.push(state);
}

function initDisambiguationPlanBfs(
  input: CompileDisambiguationPlanInput,
): DisambiguationPlanBfsContext {
  const itemPaths = input.itemPaths.filter((p) => p.trim());
  const categories = normalizeCategoryOrders(input.categories ?? []);

  if (itemPaths.length === 0) {
    throw new Error('Nessuna prestazione nel catalogo: verifica item_paths nell\'ontologia.');
  }
  if (categories.length === 0) {
    throw new Error('Dizionario categorie mancante: impossibile calcolare il piano.');
  }

  const corpusItems = input.corpusItems ?? buildCorpusItemsWithConstraints(itemPaths, categories);

  return {
    corpusItems,
    categories,
    catalogItemCount: itemPaths.length,
    itemPaths,
    visitedStates: new Set<string>(),
    enqueuedQueueStates: new Set<string>(),
    decisionNodes: [],
    seenDecisionKeys: new Set<string>(),
    queue: [],
    confirmStates: 0,
    deadStates: 0,
    stuckStates: 0,
    bootstrapSeedCount: 0,
  };
}

function seedDisambiguationPlanQueue(ctx: DisambiguationPlanBfsContext): void {
  const seeds = collectBootstrapSeedStates(ctx.corpusItems, ctx.categories);
  ctx.bootstrapSeedCount = seeds.length;
  for (const seed of seeds) {
    tryEnqueueState(ctx, seed);
  }
}

/** Processes one BFS step. Returns false when the queue is empty. */
function stepDisambiguationPlanBfs(ctx: DisambiguationPlanBfsContext): boolean {
  if (ctx.queue.length === 0) return false;

  const state = ctx.queue.shift()!;
  const candidates = filterPlanCandidates(ctx.corpusItems, state, ctx.categories);
  const paths = candidates.map((c) => c.path);
  const explorationKey = buildExplorationStateKey(state.acquired, paths, state.ageYears);

  if (ctx.visitedStates.has(explorationKey)) return true;
  ctx.visitedStates.add(explorationKey);

  const step = decideNextStep(state, candidates, ctx.categories);
  const stateKey = buildPlanStateKey(state);

  if (step.action === 'confirm') {
    ctx.confirmStates += 1;
    return true;
  }
  if (step.action === 'dead') {
    ctx.deadStates += 1;
    return true;
  }
  if (step.action === 'stuck') {
    ctx.stuckStates += 1;
    return true;
  }

  if (step.action === 'ask_age') {
    const categoryName = step.categoryName ?? firstAgeVincoloCategory(ctx.categories)?.name ?? 'fascia di età';
    const options = step.options ?? [];
    const signature = buildVincoloAskSignature(categoryName);
    const key = `${stateKey}||ask_age||${categoryName}`;
    if (!ctx.seenDecisionKeys.has(key)) {
      ctx.seenDecisionKeys.add(key);
      ctx.decisionNodes.push({
        key,
        signature,
        acquired: { ...state.acquired },
        ageYears: state.ageYears,
        action: 'ask_age',
        categoryName,
        options,
        style: 'ask_age',
        candidateCount: candidates.length,
        candidatePathsSample: samplePaths(paths),
      });
    }
    for (const next of expandAgeSuccessorStates(state, candidates)) {
      tryEnqueueState(ctx, next);
    }
    return true;
  }

  if (step.action === 'disambiguate' && step.categoryName && step.options) {
    const nodeKey = buildDisambiguationNodeKey(state.acquired, step.categoryName, step.options);
    if (!ctx.seenDecisionKeys.has(nodeKey)) {
      ctx.seenDecisionKeys.add(nodeKey);
      ctx.decisionNodes.push({
        key: nodeKey,
        signature: buildDisambiguationSignature(step.categoryName, step.options),
        acquired: { ...state.acquired },
        ageYears: state.ageYears,
        action: 'disambiguate',
        categoryName: step.categoryName,
        options: step.options,
        style: step.style,
        candidateCount: candidates.length,
        candidatePathsSample: samplePaths(paths),
      });
    }

    for (const opt of step.options) {
      tryEnqueueState(ctx, planStateWithDisambiguationPick(state, step.categoryName, opt));
    }
  }

  return true;
}

function finalizeDisambiguationPlanBfs(ctx: DisambiguationPlanBfsContext): DisambiguationPlanResult {
  const warnings: string[] = [];

  if (ctx.bootstrapSeedCount === 0) {
    warnings.push(
      'Nessuno stato bootstrap dal primo segmento path: verifica categorie attributo nel dizionario.',
    );
  }
  if (ctx.stuckStates > 0) {
    warnings.push(
      `${ctx.stuckStates} stati terminali ambigui (più candidati ma nessuna categoria attributo da chiedere).`,
    );
  }

  const segmentsWithCategory = ctx.corpusItems.some((item) =>
    item.segments.some((s) => s.categoryName.trim() && s.categoryType === 'attributo'),
  );
  if (!segmentsWithCategory && ctx.itemPaths.length > 0) {
    warnings.push(
      'Nessun segmento path mappato a categorie attributo nel dizionario — le disambiguazioni potrebbero essere sottostimate.',
    );
  }
  if (ctx.decisionNodes.filter((n) => n.action === 'disambiguate').length === 0 && ctx.itemPaths.length > 5) {
    warnings.push(
      `0 nodi disambiguazione su ${ctx.itemPaths.length} prestazioni: verifica che i token path siano categorizzati nel dizionario.`,
    );
  }

  const stats = buildStats(ctx.catalogItemCount, ctx.decisionNodes, ctx.visitedStates.size, {
    confirmStates: ctx.confirmStates,
    deadStates: ctx.deadStates,
    stuckStates: ctx.stuckStates,
  });

  return {
    nodes: ctx.decisionNodes,
    stats,
    computedAt: new Date().toISOString(),
    warnings,
  };
}

function buildBfsProgressSnapshot(
  ctx: DisambiguationPlanBfsContext,
  startedAt: number,
  lastProgressAt: number,
  lastProgressVisited: number,
): CompileDisambiguationPlanProgress {
  const now = typeof performance !== 'undefined' ? performance.now() : startedAt;
  const elapsedMs = now - startedAt;
  const visitedStates = ctx.visitedStates.size;
  const dtSec = Math.max(0.001, (now - lastProgressAt) / 1000);
  const statesPerSecond = (visitedStates - lastProgressVisited) / dtSec;

  return {
    visitedStates,
    queueLength: ctx.queue.length,
    decisionNodes: ctx.decisionNodes.length,
    catalogItemCount: ctx.catalogItemCount,
    elapsedMs,
    statesPerSecond,
  };
}

/**
 * Explores all reachable conversation states via BFS and collects disambiguation nodes.
 */
export function compileDisambiguationPlan(
  input: CompileDisambiguationPlanInput,
): DisambiguationPlanResult {
  const ctx = initDisambiguationPlanBfs(input);
  seedDisambiguationPlanQueue(ctx);
  while (stepDisambiguationPlanBfs(ctx)) {
    /* sync BFS */
  }
  return finalizeDisambiguationPlanBfs(ctx);
}

/**
 * Async BFS with UI progress yields — use for large catalogs so the browser stays responsive.
 */
export async function compileDisambiguationPlanAsync(
  input: CompileDisambiguationPlanInput,
  options?: CompileDisambiguationPlanAsyncOptions,
): Promise<DisambiguationPlanResult> {
  const ctx = initDisambiguationPlanBfs(input);
  seedDisambiguationPlanQueue(ctx);
  const startedAt = typeof performance !== 'undefined' ? performance.now() : 0;
  let lastProgressAt = startedAt;
  let lastProgressVisited = 0;
  let loopSteps = 0;
  let lastYieldAt = startedAt;
  const yieldEvery = options?.yieldEvery ?? DEFAULT_BFS_YIELD_EVERY;

  const reportProgress = () => {
    const snapshot = buildBfsProgressSnapshot(ctx, startedAt, lastProgressAt, lastProgressVisited);
    lastProgressAt = typeof performance !== 'undefined' ? performance.now() : lastProgressAt;
    lastProgressVisited = snapshot.visitedStates;
    options?.onProgress?.(snapshot);
  };

  reportProgress();
  await yieldToMainThread();

  while (stepDisambiguationPlanBfs(ctx)) {
    if (options?.shouldCancel?.()) {
      throw new DOMException('Calcolo piano annullato', 'AbortError');
    }

    loopSteps += 1;
    const now = typeof performance !== 'undefined' ? performance.now() : lastYieldAt + DEFAULT_BFS_YIELD_MS;
    const shouldReport = loopSteps <= 3
      || loopSteps % yieldEvery === 0
      || now - lastYieldAt >= DEFAULT_BFS_YIELD_MS;

    if (shouldReport) {
      reportProgress();
      lastYieldAt = now;
      await yieldToMainThread();
    }
  }

  reportProgress();
  await yieldToMainThread();
  return finalizeDisambiguationPlanBfs(ctx);
}

/** One simulated user utterance while walking the disambiguation plan toward a target path. */
export type GuidedPathStep =
  | { kind: 'token'; categoryName: string; userText: string }
  | { kind: 'age'; userText: string };

export interface GuidedPathResult {
  reachable: boolean;
  steps: GuidedPathStep[];
  reason?: string;
}

function tokenKeyToUserText(key: string): string {
  return key.split('+').join(' ');
}

/**
 * Simulates the dialog engine toward a single catalog item, picking the target's token at each fork.
 * Used by dialog test plan script generation.
 */
export function buildGuidedPathToTarget(
  corpusItems: readonly BundleCorpusItem[],
  categories: readonly TokenCategory[],
  targetPath: string,
): GuidedPathResult {
  const target = corpusItems.find((i) => i.path === targetPath);
  if (!target) {
    return { reachable: false, steps: [], reason: 'Path non trovato nel catalogo.' };
  }

  const allItems = [...corpusItems];
  const cats = [...categories];
  const seeds = collectBootstrapSeedStates(allItems, cats);
  const matchingSeed = seeds.find((seed) =>
    filterPlanCandidates(allItems, seed, cats).some((c) => c.path === targetPath),
  );
  if (!matchingSeed) {
    return {
      reachable: false,
      steps: [],
      reason: 'Nessuno stato bootstrap raggiunge il target (primo segmento path).',
    };
  }

  let state: PlanState = matchingSeed;
  const steps: GuidedPathStep[] = [];
  const MAX = 40;

  for (let i = 0; i < MAX; i += 1) {
    const candidates = filterPlanCandidates(allItems, state, cats);
    if (!candidates.some((c) => c.path === targetPath)) {
      return { reachable: false, steps, reason: 'Target escluso dai candidati correnti.' };
    }

    const step = decideNextStep(state, candidates, cats);

    if (step.action === 'confirm') {
      const sole = candidates.length === 1 ? candidates[0] : null;
      if (sole?.path === targetPath) {
        return { reachable: true, steps };
      }
      return {
        reachable: false,
        steps,
        reason: sole
          ? `Confirm su «${sole.path}», atteso «${targetPath}».`
          : 'Confirm con candidati multipli.',
      };
    }
    if (step.action === 'dead') {
      return { reachable: false, steps, reason: 'Nessun candidato (dead).' };
    }
    if (step.action === 'stuck') {
      return { reachable: false, steps, reason: 'Stato stuck nel piano disambiguazione.' };
    }
    if (step.action === 'ask_age') {
      const probeAges = collectAgeProbeYears(candidates);
      const agesToTry = probeAges.length > 0 ? probeAges : [30, 45, 17];
      let picked: number | null = null;
      for (const age of agesToTry) {
        const totalWeeks = ageYearsToTotalWeeks(age);
        const filtered = candidates.filter((item) =>
          pathSatisfiesAgeConstraintsFromTotalWeeks(totalWeeks, item.constraints as CompiledAgeConstraint[]),
        );
        if (filtered.some((c) => c.path === targetPath)) {
          picked = age;
          break;
        }
      }
      if (picked == null) {
        return { reachable: false, steps, reason: 'Età probe non mantiene il target nei candidati.' };
      }
      state = planStateWithAgeAnswer(state, picked);
      steps.push({ kind: 'age', userText: `${picked} anni` });
      continue;
    }
    if (step.action === 'disambiguate' && step.categoryName && step.options) {
      const option = getItemAttributoValueSetKey(target, step.categoryName);
      const pick = step.options.includes(option)
        ? option
        : step.options.find((o) => o !== MISSING_VALUE);
      if (!pick || !step.options.includes(pick)) {
        return {
          reachable: false,
          steps,
          reason: `Opzione target «${option}» non tra [${step.options.join(', ')}].`,
        };
      }
      state = planStateWithDisambiguationPick(state, step.categoryName, pick);
      steps.push({
        kind: 'token',
        categoryName: step.categoryName,
        userText: tokenKeyToUserText(pick),
      });
      continue;
    }
  }

  return { reachable: false, steps, reason: 'Troppe iterazioni nel percorso guidato.' };
}
