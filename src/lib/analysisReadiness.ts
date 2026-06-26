/**
 * Agent readiness checks without legacy taxonomy rows.
 */
import type { Analysis } from './analysisTypes';
import type { DisambiguationPlanStorage } from './disambiguationPlanTypes';
import { isCategoryGrammarsLayerReady } from './categoryGrammar';
import type { TokenCategory } from './dictionaryTree';
import { hasSavedDisambiguationContent } from './disambiguationPlanMessages';
import { hasSavedChatTests } from './savedChatTests';

/** True when analysis has segmented catalog paths. */
export function hasOntologyItemPaths(analysis: Analysis | null | undefined): boolean {
  return (analysis?.item_paths?.length ?? 0) > 0;
}

/** True when analysis has ontology paths and/or a disambiguation plan worth persisting. */
export function hasPersistableAnalysisState(analysis: Analysis | null | undefined): boolean {
  if (!analysis) return false;
  return hasOntologyItemPaths(analysis)
    || hasSavedDisambiguationContent(analysis.disambiguation_plan)
    || hasSavedChatTests(analysis.saved_chat_tests);
}

function planHasUsableMessages(plan: DisambiguationPlanStorage | null | undefined): boolean {
  if (!plan?.messages?.length) return false;
  return plan.messages.some((m) => !!m.question?.trim());
}

function planMessagesComplete(plan: DisambiguationPlanStorage | null | undefined): boolean {
  if (!plan?.messages?.length) return false;
  return plan.messages.some(
    (m) => !!(
      m.question?.trim()
      && m.no_match_1?.trim()
      && m.no_match_2?.trim()
      && m.no_match_3?.trim()
    ),
  );
}

/** Category grammars are configured for attributo categories. */
export function isGrammarsReady(categories: TokenCategory[]): boolean {
  if (!categories.length) return false;
  return isCategoryGrammarsLayerReady(categories);
}

/** At least one disambiguation message exists in the saved plan. */
export function hasDisambiguationMessages(analysis: Analysis | null | undefined): boolean {
  return planHasUsableMessages(analysis?.disambiguation_plan);
}

/** Disambiguation copy is complete enough for agent test. */
export function isAgentReady(
  analysis: Analysis | null | undefined,
  categories: TokenCategory[],
): boolean {
  if (!hasOntologyItemPaths(analysis)) return false;
  if (!isGrammarsReady(categories)) return false;
  return planMessagesComplete(analysis?.disambiguation_plan);
}

/** Messages layer ready when plan has generated copy. */
export function isMessagesReady(analysis: Analysis | null | undefined): boolean {
  return planMessagesComplete(analysis?.disambiguation_plan);
}
