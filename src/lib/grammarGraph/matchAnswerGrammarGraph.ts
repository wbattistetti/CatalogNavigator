/**
 * Client for VB grammar graph match API (no regex compilation in TS).
 */
import type { AnswerGrammarMatchResponse, GrammarGraph } from './grammarGraphTypes';

const DIALOG_ENGINE_URL =
  import.meta.env.VITE_DIALOG_ENGINE_URL?.trim() || 'http://127.0.0.1:5190';

export async function matchAnswerGrammarGraph(
  graph: GrammarGraph,
  text: string,
): Promise<AnswerGrammarMatchResponse> {
  const res = await fetch(`${DIALOG_ENGINE_URL}/api/grammar/match-answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ graph, text }),
  });
  const data = await res.json() as AnswerGrammarMatchResponse & { error?: string };
  if (!res.ok) {
    return {
      matchedOption: null,
      matchedOptions: [],
      compileError: data.compileError ?? data.error ?? `HTTP ${res.status}`,
    };
  }
  return {
    matchedOption: data.matchedOption ?? null,
    matchedOptions: data.matchedOptions ?? [],
    compileError: data.compileError ?? null,
  };
}
