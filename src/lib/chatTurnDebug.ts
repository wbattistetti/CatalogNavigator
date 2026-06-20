/**
 * Builds debug payloads for VB chat test messages (stuck / no_match turns).
 */
import type { AgentBundle, AgentConcept, AgentTurnAction } from './agentBundleTypes';
import type { TokenCategory } from './dictionaryTree';
import {
  getItemAttributoValueSetKey,
  parseValueSetKey,
  valueSetContainsAll,
} from './valueSet';
import { normalizeSlotCategoryKey } from './slotExtract';
import type { VbTextTurnResponse } from './vbTestEngineClient';

export interface AttributoStuckAnalysis {
  categoryName: string;
  acquired: boolean;
  distinctSetCount: number;
  distinctSets: string[];
  wouldAsk: boolean;
}

export interface ChatTurnDebug {
  action: AgentTurnAction;
  label: string;
  candidateCount: number;
  candidatePaths: string[];
  parsed: { category: string; value: string }[];
  acquiredConcepts: AgentConcept[];
  debugLog?: string;
  debugParsedBlock?: string;
  attributoAnalysis: AttributoStuckAnalysis[];
}

function acquiredMap(concepts: AgentConcept[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const c of concepts) {
    if (!c.category?.trim()) continue;
    const key = normalizeSlotCategoryKey(c.category);
    const values = (c.values ?? []).map((v) => v.trim()).filter(Boolean);
    if (values.length === 0) continue;
    map[key] = [...values].sort((a, b) => a.localeCompare(b, 'it')).join('+');
  }
  return map;
}

function orderedAttributoCategories(
  categories: TokenCategory[],
  candidatePaths: Set<string>,
  corpusPaths: Map<string, AgentBundle['corpusItems'][number]>,
): TokenCategory[] {
  const names = new Set<string>();
  for (const path of candidatePaths) {
    const item = corpusPaths.get(path);
    if (!item) continue;
    for (const seg of item.segments) {
      if (seg.categoryType === 'attributo' && seg.categoryName.trim()) {
        names.add(seg.categoryName.trim());
      }
    }
  }
  return categories
    .filter((c) => c.type !== 'vincolo' && names.has(c.name))
    .sort((a, b) => a.order - b.order);
}

function analyzeAttributoStuck(
  bundle: AgentBundle,
  candidatePaths: string[],
  acquiredConcepts: AgentConcept[],
  exactAttributoCategories: readonly string[] = [],
): AttributoStuckAnalysis[] {
  const pathSet = new Set(candidatePaths);
  const corpusByPath = new Map(bundle.corpusItems.map((item) => [item.path, item]));
  const candidates = bundle.corpusItems.filter((item) => pathSet.has(item.path));
  if (candidates.length === 0) return [];

  const categories = bundle.dictionary.categories ?? [];
  const acquired = acquiredMap(acquiredConcepts);
  const ordered = orderedAttributoCategories(categories, pathSet, corpusByPath);

  return ordered.map((category) => {
    const catKey = normalizeSlotCategoryKey(category.name);
    const sets = new Set<string>();
    for (const item of candidates) {
      sets.add(getItemAttributoValueSetKey(item, category.name));
    }
    const distinctSets = [...sets].sort((a, b) => a.localeCompare(b, 'it'));
    const acquiredKey = acquired[catKey];
    const isAcquired = acquiredKey != null;
    const isResolved =
      candidates.length <= 1 ||
      distinctSets.length <= 1 ||
      !isAcquired ||
      !distinctSets.includes(acquiredKey) ||
      exactAttributoCategories.some((c) => c.trim() === category.name.trim()) ||
      !distinctSets.some((otherKey) => {
        if (otherKey === acquiredKey) return false;
        const otherValues = parseValueSetKey(otherKey);
        const acquiredValues = parseValueSetKey(acquiredKey);
        return (
          otherValues.length > acquiredValues.length &&
          valueSetContainsAll(otherValues, acquiredValues)
        );
      });
    return {
      categoryName: category.name,
      acquired: isAcquired,
      distinctSetCount: distinctSets.length,
      distinctSets,
      wouldAsk: !isResolved && distinctSets.length >= 2,
    };
  });
}

function buildTurnDebugLabel(action: AgentTurnAction, candidateCount: number): string {
  if (action === 'no_match' && candidateCount > 1) {
    return `STUCK · ${candidateCount} candidati, nessuna disambiguazione attributo`;
  }
  if (action === 'no_match' && candidateCount === 0) {
    return 'NO_MATCH · 0 candidati';
  }
  if (action === 'no_match') {
    return `NO_MATCH · ${candidateCount} candidat${candidateCount === 1 ? 'o' : 'i'}`;
  }
  return action;
}

/** Returns debug info for turns that need operator visibility (no_match / stuck). */
export function buildChatTurnDebug(
  result: VbTextTurnResponse,
  bundle: AgentBundle | null | undefined,
): ChatTurnDebug | undefined {
  const action = result.instruction?.action;
  if (action !== 'no_match') return undefined;

  const candidatePaths = result.candidatePaths ?? [];
  const candidateCount = result.candidateCount ?? candidatePaths.length;
  const acquiredConcepts = result.nextState?.acquiredConcepts ?? [];
  const exactAttributoCategories = result.nextState?.exactAttributoCategories ?? [];

  return {
    action,
    label: buildTurnDebugLabel(action, candidateCount),
    candidateCount,
    candidatePaths,
    parsed: (result.parsed ?? []).map((p) => ({
      category: p.category,
      value: p.value,
    })),
    acquiredConcepts,
    debugLog: result.debug?.log,
    debugParsedBlock: result.debug?.parsedBlock,
    attributoAnalysis: bundle
      ? analyzeAttributoStuck(bundle, candidatePaths, acquiredConcepts, exactAttributoCategories)
      : [],
  };
}

/** True when the debug panel should open expanded by default. */
export function shouldAutoExpandTurnDebug(debug: ChatTurnDebug | undefined): boolean {
  return debug?.action === 'no_match' && (debug.candidateCount ?? 0) > 1;
}
