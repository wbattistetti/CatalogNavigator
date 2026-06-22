/**
 * Applies BFS disambiguation plan results without blocking the browser main thread.
 */
import { yieldToMainThread } from './corpusSegmentationCache';
import type { TokenCategory } from './dictionaryTree';
import type { DisambiguationPlanResult } from './disambiguationPlanTypes';
import type { DisambiguationPlanStorage } from './disambiguationPlanTypes';
import {
  buildDisambiguationEditorRows,
  mergeDisambiguationPlanAfterCompute,
  type DisambiguationMergeStats,
} from './disambiguationPlanMessages';

/** Builds editor rows + storage after Calcola, yielding between heavy steps. */
export async function applyDisambiguationComputeResultAsync(
  result: DisambiguationPlanResult,
  previousPlan: DisambiguationPlanStorage | null | undefined,
  categories: readonly TokenCategory[],
): Promise<{ storage: DisambiguationPlanStorage; stats: DisambiguationMergeStats }> {
  await yieldToMainThread();
  const rows = buildDisambiguationEditorRows(result, previousPlan, categories, {
    deferGrammarCompile: true,
  });
  await yieldToMainThread();
  return mergeDisambiguationPlanAfterCompute(rows, result.computedAt, previousPlan);
}
