/**
 * State keys and helpers for disambiguation plan BFS (shared across plan modules).
 */
import { normalizeSlotCategoryKey } from './slotExtract';
import type { PlanConversationState } from './catalogFilterPlan';

export type PlanState = PlanConversationState;

function sortedAcquiredEntries(acquired: Record<string, string>): [string, string][] {
  return Object.entries(acquired).sort(([a], [b]) => a.localeCompare(b, 'it'));
}

/** Canonical state key including age (for node identity). */
export function buildPlanStateKey(state: PlanState): string {
  const parts = sortedAcquiredEntries(state.acquired).map(([k, v]) => `${k}=${v}`);
  const base = parts.join('|');
  return state.ageYears != null ? `${base}||age=${state.ageYears}` : base;
}

/** Dedup key for enqueued plan states (before expensive candidate filtering). */
export function buildQueueStateKey(state: PlanState): string {
  const exact = state.exactAttributoCategories.length === 0
    ? ''
    : `||exact:${[...state.exactAttributoCategories].sort((a, b) => a.localeCompare(b, 'it')).join(',')}`;
  return `${buildPlanStateKey(state)}${exact}`;
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

/** Creates an empty plan conversation state. */
export function createEmptyPlanState(): PlanState {
  return {
    acquired: {},
    ageTotalWeeks: null,
    ageYears: null,
    exactAttributoCategories: [],
  };
}

/** Applies a simulated ask_age answer (years). */
export function planStateWithAgeAnswer(state: PlanState, ageYears: number): PlanState {
  return {
    acquired: { ...state.acquired },
    ageTotalWeeks: ageYears * 52,
    ageYears,
    exactAttributoCategories: [...state.exactAttributoCategories],
  };
}

/** Applies a simulated disambiguation pick (exact commit). */
export function planStateWithDisambiguationPick(
  state: PlanState,
  categoryName: string,
  option: string,
): PlanState {
  const catKey = normalizeSlotCategoryKey(categoryName);
  const exact = state.exactAttributoCategories.filter((c) => c !== categoryName);
  exact.push(categoryName);
  return {
    acquired: { ...state.acquired, [catKey]: option },
    ageTotalWeeks: state.ageTotalWeeks,
    ageYears: state.ageYears,
    exactAttributoCategories: exact,
  };
}
