/**
 * Applies accepted token categorization suggestions to category layout.
 */
import { assignTokensToCategory } from './dictionaryTokenDrag';
import { syncCategoriesWithTokens, type TokenCategory } from './dictionaryTree';
import type { CategorizeAssignmentSuggestion } from './categorizeTokensAi';
import type { TokenEntry } from './tokenDictionary';

/** Applies selected suggestions; returns synced categories. */
export function applyCategorizeSuggestions(
  categories: TokenCategory[],
  tokens: TokenEntry[],
  accepted: CategorizeAssignmentSuggestion[],
): TokenCategory[] {
  let next = categories;
  for (const item of accepted) {
    next = assignTokensToCategory(next, item.categoryId, [item.token]);
  }
  return syncCategoriesWithTokens(next, tokens);
}
