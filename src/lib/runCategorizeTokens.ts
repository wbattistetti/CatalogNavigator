/**
 * Calls OpenAI to suggest token → category assignments from corpus context.
 */
import { invokeFunction } from './invokeFunction';
import {
  buildCategorizeTokensSnapshot,
  type CategorizeTokensSnapshot,
  type CategorizeUncategorizedToken,
} from './categorizeTokensContext';
import {
  buildCategorizeTokensUserMessage,
  CATEGORIZE_TOKENS_SYSTEM_PROMPT,
} from './categorizeTokensPrompts';
import {
  parseCategorizeAiContent,
  validateCategorizeSuggestions,
  type CategorizeAssignmentSuggestion,
} from './categorizeTokensAi';
import type { TokenCategory } from './dictionaryTree';
import type { TokenEntry } from './tokenDictionary';

const BATCH_SIZE = 35;

interface OpenAiProxyResponse {
  content?: string;
}

async function callCategorizeProxy(
  userMessage: string,
  signal?: AbortSignal,
): Promise<unknown[]> {
  const data = await invokeFunction<OpenAiProxyResponse>('analyze-document', {
    systemPrompt: CATEGORIZE_TOKENS_SYSTEM_PROMPT,
    userMessage,
    maxTokens: 4096,
  }, signal);

  if (typeof data.content !== 'string') {
    throw new Error('Risposta AI non valida: manca il contenuto OpenAI');
  }
  return parseCategorizeAiContent(data.content);
}

async function categorizeBatch(
  snapshot: CategorizeTokensSnapshot,
  batch: CategorizeUncategorizedToken[],
  uncategorizedSet: ReadonlySet<string>,
  categoryNameById: ReadonlyMap<string, string>,
  signal?: AbortSignal,
): Promise<CategorizeAssignmentSuggestion[]> {
  const userMessage = buildCategorizeTokensUserMessage(snapshot, batch);
  const rawRows = await callCategorizeProxy(userMessage, signal);
  const { suggestions } = validateCategorizeSuggestions(
    rawRows,
    uncategorizedSet,
    categoryNameById,
  );
  return suggestions;
}

export interface RunCategorizeTokensInput {
  tokens: TokenEntry[];
  categories: TokenCategory[];
  descriptions: string[];
}

export interface RunCategorizeTokensResult {
  suggestions: CategorizeAssignmentSuggestion[];
  skippedTokens: string[];
  uncategorizedCount: number;
}

/** Runs AI categorization for all uncategorized tokens (batched). */
export async function runCategorizeTokens(
  input: RunCategorizeTokensInput,
  signal?: AbortSignal,
): Promise<RunCategorizeTokensResult> {
  const snapshot = buildCategorizeTokensSnapshot(
    input.tokens,
    input.categories,
    input.descriptions,
  );

  if (snapshot.catalogation.length === 0) {
    throw new Error('Crea almeno una categoria prima di categorizzare');
  }
  if (snapshot.uncategorized.length === 0) {
    throw new Error('Nessun token in «no category» da assegnare');
  }

  const uncategorizedSet = new Set(snapshot.uncategorized.map((t) => t.token));
  const categoryNameById = new Map(snapshot.catalogation.map((c) => [c.id, c.name]));

  const allSuggestions: CategorizeAssignmentSuggestion[] = [];
  const assigned = new Set<string>();

  for (let i = 0; i < snapshot.uncategorized.length; i += BATCH_SIZE) {
    if (signal?.aborted) throw new DOMException('Categorizzazione annullata', 'AbortError');

    const batch = snapshot.uncategorized.slice(i, i + BATCH_SIZE);
    const batchSuggestions = await categorizeBatch(
      snapshot,
      batch,
      uncategorizedSet,
      categoryNameById,
      signal,
    );

    for (const s of batchSuggestions) {
      if (assigned.has(s.token)) continue;
      assigned.add(s.token);
      allSuggestions.push(s);
    }
  }

  const skippedTokens = snapshot.uncategorized
    .map((t) => t.token)
    .filter((t) => !assigned.has(t));

  return {
    suggestions: allSuggestions,
    skippedTokens,
    uncategorizedCount: snapshot.uncategorized.length,
  };
}
