/**
 * Parses and validates AI token categorization responses.
 */
import { sanitizeOpenAiJsonRegex } from './grammarNormalize';

export const MIN_CATEGORIZE_CONFIDENCE = 0.7;

export interface CategorizeAssignmentSuggestion {
  token: string;
  categoryId: string;
  categoryName: string;
  confidence: number;
  reason: string;
}

export interface CategorizeTokensAiResult {
  suggestions: CategorizeAssignmentSuggestion[];
  skippedTokens: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseConfidence(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(1, Math.max(0, value));
  }
  if (typeof value === 'string') {
    const n = Number.parseFloat(value);
    if (Number.isFinite(n)) return Math.min(1, Math.max(0, n));
  }
  return null;
}

/** Parses raw OpenAI JSON content into assignment rows. */
export function parseCategorizeAiContent(rawContent: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    try {
      parsed = JSON.parse(sanitizeOpenAiJsonRegex(rawContent));
    } catch {
      throw new Error(`JSON OpenAI non valido: ${rawContent.slice(0, 200)}`);
    }
  }

  const root = asRecord(parsed);
  if (!root) throw new Error('Risposta AI: atteso oggetto JSON');

  if (Array.isArray(root.assignments)) return root.assignments;
  if (Array.isArray(parsed)) return parsed;
  throw new Error('Risposta AI: manca il campo "assignments"');
}

export function validateCategorizeSuggestions(
  rawRows: unknown[],
  uncategorizedTokens: ReadonlySet<string>,
  categoryNameById: ReadonlyMap<string, string>,
  minConfidence = MIN_CATEGORIZE_CONFIDENCE,
): CategorizeTokensAiResult {
  const seen = new Set<string>();
  const suggestions: CategorizeAssignmentSuggestion[] = [];

  for (const row of rawRows) {
    const rec = asRecord(row);
    if (!rec) continue;

    const token = typeof rec.token === 'string' ? rec.token.trim() : '';
    const categoryId = typeof rec.categoryId === 'string' ? rec.categoryId.trim() : '';
    const confidence = parseConfidence(rec.confidence);
    const reason = typeof rec.reason === 'string' ? rec.reason.trim() : '';

    if (!token || !categoryId || confidence == null) continue;
    if (!uncategorizedTokens.has(token)) continue;
    if (!categoryNameById.has(categoryId)) continue;
    if (confidence < minConfidence) continue;
    if (seen.has(token)) continue;

    seen.add(token);
    suggestions.push({
      token,
      categoryId,
      categoryName: categoryNameById.get(categoryId)!,
      confidence,
      reason,
    });
  }

  const skippedTokens = [...uncategorizedTokens].filter((t) => !seen.has(t));
  return { suggestions, skippedTokens };
}
