/**
 * Active answer grammar representation for a disambiguation message (text regex vs graph).
 */
import type { DisambiguationMessageRecord } from '../disambiguationPlanTypes';

export type AnswerGrammarMode = 'text' | 'graph';

export function resolveAnswerGrammarMode(
  record: Pick<DisambiguationMessageRecord, 'answer_grammar_mode'> | null | undefined,
): AnswerGrammarMode {
  return record?.answer_grammar_mode === 'graph' ? 'graph' : 'text';
}
