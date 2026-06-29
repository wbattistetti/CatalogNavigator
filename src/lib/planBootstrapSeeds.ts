/**
 * Bootstrap seed states for disambiguation plan BFS — mirrors post-start_question implicit NLU.
 */
import type { BundleCorpusItem } from './agentBundleTypes';
import type { TokenCategory } from './dictionaryTree';
import { buildQueueStateKey, type PlanState } from './compileDisambiguationPlanState';
import { filterPlanCandidates } from './catalogFilterPlan';
import { normalizeSlotCategoryKey } from './slotExtract';
import { valueSetKey } from './valueSet';

/**
 * Collects implicit first-turn acquisition states from the first attributo segment of each path.
 * Matches runtime: user answers start_question (e.g. «esame») → NLU acquires without exact commit.
 */
export function collectBootstrapSeedStates(
  corpusItems: BundleCorpusItem[],
  categories: TokenCategory[],
): PlanState[] {
  const seeds: PlanState[] = [];
  const seen = new Set<string>();

  for (const item of corpusItems) {
    const firstAttributo = item.segments.find(
      (s) => s.text?.trim() && s.categoryType !== 'vincolo' && s.categoryName.trim(),
    );
    if (!firstAttributo) continue;

    const catKey = normalizeSlotCategoryKey(firstAttributo.categoryName);
    const setKey = valueSetKey([firstAttributo.text.trim()]);

    const state: PlanState = {
      acquired: { [catKey]: setKey },
      ageTotalWeeks: null,
      ageYears: null,
      exactAttributoCategories: [],
    };

    const queueKey = buildQueueStateKey(state);
    if (seen.has(queueKey)) continue;

    const filtered = filterPlanCandidates(corpusItems, state, categories);
    if (filtered.length === 0) continue;

    seen.add(queueKey);
    seeds.push(state);
  }

  return seeds.sort((a, b) => buildQueueStateKey(a).localeCompare(buildQueueStateKey(b), 'it'));
}
