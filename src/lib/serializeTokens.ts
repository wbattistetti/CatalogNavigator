/**
 * Serializes token dictionary for dirty-state comparison.
 */
import type { TokenCategory } from './dictionaryTree';
import type { TokenEntry } from './tokenDictionary';

export function serializeTokenEntries(tokens: TokenEntry[]): string {
  return JSON.stringify(
    tokens.map(({ text, enabled, suppressedBy, aliasOf, grammar }) => ({
      text, enabled, suppressedBy, aliasOf, grammar: grammar ?? null,
    })),
  );
}

export function serializeDictionarySnapshot(
  tokens: TokenEntry[],
  categories: TokenCategory[],
): string {
  return JSON.stringify({
    tokens: tokens.map(({ text, enabled, suppressedBy, aliasOf, grammar }) => ({
      text, enabled, suppressedBy, aliasOf, grammar: grammar ?? null,
    })),
    categories: categories.map(({ id, name, order, tokenTexts, type }) => ({
      id, name, order, tokenTexts, type,
    })),
  });
}
