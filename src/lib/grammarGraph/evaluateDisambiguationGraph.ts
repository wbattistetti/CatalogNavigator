/**
 * Evaluates disambiguation test phrases against a grammar graph via VB API.
 */
import type { DisambiguationTestPhraseEvaluation } from '../disambiguationAnswerGrammarEditor';
import { matchAnswerGrammarGraph } from './matchAnswerGrammarGraph';
import type { GrammarGraph } from './grammarGraphTypes';

export async function evaluateDisambiguationGraphTestPhrase(
  graph: GrammarGraph,
  phrase: string,
  expected: string,
): Promise<DisambiguationTestPhraseEvaluation> {
  const text = phrase.trim();
  if (!text) {
    return { status: 'no_match', recognized: null, matchedOptions: [], compileError: null };
  }

  const result = await matchAnswerGrammarGraph(graph, text);
  if (result.compileError) {
    return {
      status: 'error',
      recognized: null,
      matchedOptions: [],
      compileError: result.compileError,
    };
  }

  const matchedOptions = result.matchedOptions;
  if (matchedOptions.length === 0) {
    return { status: 'no_match', recognized: null, matchedOptions: [], compileError: null };
  }
  if (matchedOptions.length > 1) {
    return {
      status: 'ambiguous',
      recognized: result.matchedOption,
      matchedOptions,
      compileError: null,
    };
  }

  const recognized = matchedOptions[0]!;
  if (recognized === expected) {
    return { status: 'ok', recognized, matchedOptions, compileError: null };
  }
  return { status: 'mismatch', recognized, matchedOptions, compileError: null };
}
