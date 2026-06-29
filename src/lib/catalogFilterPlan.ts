/**
 * Catalog filtering for disambiguation plan BFS — mirrors VB CatalogFilter.
 */
import type { BundleCorpusItem } from './agentBundleTypes';
import { pathSatisfiesAgeConstraintsFromTotalWeeks } from './constraintValidation';
import type { TokenCategory } from './dictionaryTree';
import { normalizeSlotCategoryKey } from './slotExtract';
import {
  getItemAttributoValues,
  isMissingValueList,
  isMissingValueSetKey,
  parseValueSetKey,
  valueSetContainsAll,
  valueSetsEqual,
} from './valueSet';

/** Conversation state used while simulating dialog progression in compileDisambiguationPlan. */
export interface PlanConversationState {
  /** Attributo category key → canonical value-set key. */
  acquired: Record<string, string>;
  /** Patient age as total weeks (vincolo concept), when ask_age was answered. */
  ageTotalWeeks: number | null;
  /** Display years for plan nodes (derived from age answer). */
  ageYears: number | null;
  /** Attributo categories committed via an explicit disambiguation answer. */
  exactAttributoCategories: string[];
}

function isExactAttributoCategory(
  exactAttributoCategories: readonly string[],
  categoryName: string,
): boolean {
  return exactAttributoCategories.some(
    (c) => c.trim() && c.trim() === categoryName.trim(),
  );
}

function itemMissingCategoryValue(item: BundleCorpusItem, categoryName: string): boolean {
  return isMissingValueList(getItemAttributoValues(item, categoryName));
}

function itemMatchesAttributoConcept(
  item: BundleCorpusItem,
  categoryName: string,
  setKey: string,
  exactAttributoCategories: readonly string[],
): boolean {
  const mentioned = parseValueSetKey(setKey);
  if (isMissingValueSetKey(setKey) || isMissingValueList(mentioned)) {
    return itemMissingCategoryValue(item, categoryName);
  }

  const itemValues = getItemAttributoValues(item, categoryName);
  if (isExactAttributoCategory(exactAttributoCategories, categoryName)) {
    return valueSetsEqual(itemValues, mentioned);
  }
  return valueSetContainsAll(itemValues, mentioned);
}

function itemSatisfiesAgeVincolo(item: BundleCorpusItem, ageTotalWeeks: number): boolean {
  return pathSatisfiesAgeConstraintsFromTotalWeeks(ageTotalWeeks, item.constraints);
}

/** True when the simulated session has at least one acquired concept (matches CatalogFilter guard). */
export function planStateHasAcquiredConcepts(state: PlanConversationState): boolean {
  return Object.keys(state.acquired).length > 0;
}

/** True when patient age was collected via ask_age. */
export function planStateHasAcquiredAge(state: PlanConversationState): boolean {
  return state.ageTotalWeeks != null;
}

/** Converts spoken age in years to total weeks (mirrors VB AgeUnitConverter.ToTotalWeeks). */
export function ageYearsToTotalWeeks(years: number): number {
  return years * 52;
}

/**
 * Filters catalog items against acquired attributo concepts and age vincolo.
 * Empty acquired → no candidates (bootstrap / start_question has no catalog yet).
 */
export function filterPlanCandidates(
  allItems: BundleCorpusItem[],
  state: PlanConversationState,
  categories: TokenCategory[],
): BundleCorpusItem[] {
  if (!planStateHasAcquiredConcepts(state)) return [];

  return allItems.filter((item) => {
    for (const [catKey, setKey] of Object.entries(state.acquired)) {
      const category = categories.find((c) => normalizeSlotCategoryKey(c.name) === catKey);
      if (!category) continue;
      if (!itemMatchesAttributoConcept(
        item,
        category.name,
        setKey,
        state.exactAttributoCategories,
      )) {
        return false;
      }
    }

    if (state.ageTotalWeeks != null && !itemSatisfiesAgeVincolo(item, state.ageTotalWeeks)) {
      return false;
    }

    return true;
  });
}
