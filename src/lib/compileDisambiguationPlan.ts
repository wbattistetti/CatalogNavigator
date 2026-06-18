/**
 * Compiles the reachable disambiguation graph from catalog + dictionary categories.
 * Mirrors VB DialogEngine next-step logic (AgentSlotMatch + CatalogFilter planning mode).
 */
import type { BundleCorpusItem, CompiledAgeConstraint } from './agentBundleTypes';
import { pathSatisfiesAgeConstraints } from './constraintValidation';
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
import { buildCorpusItemsFromPaths, normalizeSlotCategoryKey } from './slotExtract';
import { buildVincoloAskSignature } from './disambiguationPlanMessages';
import { isAgeVincoloCategoryName } from './vincoloResolutionGrammar';

const MISSING_VALUE = 'none';

export interface CompileDisambiguationPlanInput {
  itemPaths: string[];
  categories: TokenCategory[];
  corpusItems?: BundleCorpusItem[];
}

interface PlanState {
  acquired: Record<string, string>;
  ageYears: number | null;
}

interface NextStepResult {
  action: DisambiguationAction;
  categoryName?: string;
  options?: string[];
  style?: DisambiguationQuestionStyle;
}

function sortedAcquiredEntries(acquired: Record<string, string>): [string, string][] {
  return Object.entries(acquired).sort(([a], [b]) => a.localeCompare(b, 'it'));
}

/** Canonical state key including age (for node identity). */
export function buildPlanStateKey(state: PlanState): string {
  const parts = sortedAcquiredEntries(state.acquired).map(([k, v]) => `${k}=${v}`);
  const base = parts.join('|');
  return state.ageYears != null ? `${base}||age=${state.ageYears}` : base;
}

/**
 * BFS dedup key: same acquired slots + same surviving candidates = same situation.
 * Merges ages that filter the catalog identically.
 */
export function buildExplorationStateKey(
  acquired: Record<string, string>,
  candidatePaths: string[],
  ageYears: number | null = null,
): string {
  const acq = sortedAcquiredEntries(acquired).map(([k, v]) => `${k}=${v}`).join('|');
  const agePart = ageYears != null ? `||age=${ageYears}` : '';
  const paths = [...candidatePaths].sort((a, b) => a.localeCompare(b, 'it')).join('|');
  return `${acq}${agePart}||cands:${paths}`;
}

/** Runtime lookup key for a disambiguation prompt at a given state. */
export function buildDisambiguationNodeKey(
  acquired: Record<string, string>,
  categoryName: string,
  options: string[],
): string {
  const statePart = sortedAcquiredEntries(acquired).map(([k, v]) => `${k}=${v}`).join('|');
  const opts = [...options].sort((a, b) => a.localeCompare(b, 'it')).join('|');
  return `${statePart}||${categoryName.trim()}||${opts}`;
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
  return getItemSegmentValue(item, categoryName, 'attributo');
}

function itemMatchesAcquired(
  item: BundleCorpusItem,
  acquired: Record<string, string>,
  categories: TokenCategory[],
): boolean {
  for (const [catKey, value] of Object.entries(acquired)) {
    const category = categories.find((c) => normalizeSlotCategoryKey(c.name) === catKey);
    if (!category) continue;
    if (getItemAttributoValue(item, category.name) !== value) return false;
  }
  return true;
}

function filterCandidates(
  allItems: BundleCorpusItem[],
  state: PlanState,
  categories: TokenCategory[],
): BundleCorpusItem[] {
  let items = allItems.filter((item) => itemMatchesAcquired(item, state.acquired, categories));
  if (state.ageYears != null) {
    items = items.filter((item) =>
      pathSatisfiesAgeConstraints(state.ageYears!, item.constraints as CompiledAgeConstraint[]),
    );
  }
  return items;
}

function distinctAttributoValues(
  candidates: BundleCorpusItem[],
  categoryName: string,
): Set<string> {
  const values = new Set<string>();
  for (const item of candidates) {
    values.add(getItemAttributoValue(item, categoryName));
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
  if (state.ageYears != null) return false;
  if (candidates.length <= 1) return false;
  if (anyItemHasAgeConstraint(candidates)) return true;
  return hasUnresolvedAgeVincoloAmongCandidates(candidates, state.acquired, categories);
}

function findDisambiguationTarget(
  candidates: BundleCorpusItem[],
  acquired: Record<string, string>,
  categories: TokenCategory[],
): { categoryName: string; options: string[] } | null {
  for (const category of orderedAttributoCategories(categories, candidates)) {
    const key = normalizeSlotCategoryKey(category.name);
    if (acquired[key] != null) continue;

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

  const target = findDisambiguationTarget(candidates, state.acquired, categories);
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
    const filtered = candidates.filter((item) =>
      pathSatisfiesAgeConstraints(age, item.constraints as CompiledAgeConstraint[]),
    );
    if (filtered.length === 0) continue;
    const setKey = filtered.map((i) => i.path).sort((a, b) => a.localeCompare(b, 'it')).join('|');
    if (seenCandidateSets.has(setKey)) continue;
    seenCandidateSets.add(setKey);
    successors.push({ acquired: { ...state.acquired }, ageYears: age });
  }

  if (successors.length === 0 && candidates.length > 0) {
    successors.push({ acquired: { ...state.acquired }, ageYears: 30 });
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

/**
 * Explores all reachable conversation states via BFS and collects disambiguation nodes.
 */
export function compileDisambiguationPlan(
  input: CompileDisambiguationPlanInput,
): DisambiguationPlanResult {
  const warnings: string[] = [];
  const itemPaths = input.itemPaths.filter((p) => p.trim());
  const categories = normalizeCategoryOrders(input.categories ?? []);

  if (itemPaths.length === 0) {
    throw new Error('Nessuna prestazione nel catalogo: verifica item_paths nell\'ontologia.');
  }
  if (categories.length === 0) {
    throw new Error('Dizionario categorie mancante: impossibile calcolare il piano.');
  }

  const corpusItems = input.corpusItems ?? buildCorpusItemsFromPaths(itemPaths, categories);

  const visitedStates = new Set<string>();
  const decisionNodes: DisambiguationPlanNode[] = [];
  const seenDecisionKeys = new Set<string>();

  let confirmStates = 0;
  let deadStates = 0;
  let stuckStates = 0;

  const queue: PlanState[] = [{ acquired: {}, ageYears: null }];

  while (queue.length > 0) {
    const state = queue.shift()!;
    const candidates = filterCandidates(corpusItems, state, categories);
    const paths = candidates.map((c) => c.path);
    const explorationKey = buildExplorationStateKey(state.acquired, paths, state.ageYears);

    if (visitedStates.has(explorationKey)) continue;
    visitedStates.add(explorationKey);

    const step = decideNextStep(state, candidates, categories);
    const stateKey = buildPlanStateKey(state);

    if (step.action === 'confirm') {
      confirmStates += 1;
      continue;
    }
    if (step.action === 'dead') {
      deadStates += 1;
      continue;
    }
    if (step.action === 'stuck') {
      stuckStates += 1;
      continue;
    }

    if (step.action === 'ask_age') {
      const categoryName = step.categoryName ?? firstAgeVincoloCategory(categories)?.name ?? 'fascia di età';
      const options = step.options ?? [];
      const signature = buildVincoloAskSignature(categoryName);
      const key = `${stateKey}||ask_age||${categoryName}`;
      if (!seenDecisionKeys.has(key)) {
        seenDecisionKeys.add(key);
        decisionNodes.push({
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
        queue.push(next);
      }
      continue;
    }

    if (step.action === 'disambiguate' && step.categoryName && step.options) {
      const nodeKey = buildDisambiguationNodeKey(state.acquired, step.categoryName, step.options);
      if (!seenDecisionKeys.has(nodeKey)) {
        seenDecisionKeys.add(nodeKey);
        decisionNodes.push({
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
        const catKey = normalizeSlotCategoryKey(step.categoryName);
        queue.push({
          acquired: { ...state.acquired, [catKey]: opt },
          ageYears: state.ageYears,
        });
      }
    }
  }

  if (stuckStates > 0) {
    warnings.push(
      `${stuckStates} stati terminali ambigui (più candidati ma nessuna categoria attributo da chiedere).`,
    );
  }

  const segmentsWithCategory = corpusItems.some((item) =>
    item.segments.some((s) => s.categoryName.trim() && s.categoryType === 'attributo'),
  );
  if (!segmentsWithCategory && itemPaths.length > 0) {
    warnings.push(
      'Nessun segmento path mappato a categorie attributo nel dizionario — le disambiguazioni potrebbero essere sottostimate.',
    );
  }
  if (decisionNodes.filter((n) => n.action === 'disambiguate').length === 0 && itemPaths.length > 5) {
    warnings.push(
      `0 nodi disambiguazione su ${itemPaths.length} prestazioni: verifica che i token path siano categorizzati nel dizionario.`,
    );
  }

  const stats = buildStats(itemPaths.length, decisionNodes, visitedStates.size, {
    confirmStates,
    deadStates,
    stuckStates,
  });

  return {
    nodes: decisionNodes,
    stats,
    computedAt: new Date().toISOString(),
    warnings,
  };
}
