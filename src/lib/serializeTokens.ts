/**
 * Serializes token dictionary for dirty-state comparison.
 */
import type { TokenCategory } from './dictionaryTree';
import type { TokenEntry } from './tokenDictionary';

export function serializeTokenEntries(tokens: TokenEntry[]): string {
  return JSON.stringify(
    tokens.map(({ text, enabled, suppressedBy }) => ({ text, enabled, suppressedBy })),
  );
}

export function serializeDictionarySnapshot(
  tokens: TokenEntry[],
  categories: TokenCategory[],
): string {
  return JSON.stringify({
    tokens: tokens.map(({ text, enabled, suppressedBy }) => ({ text, enabled, suppressedBy })),
    categories: categories.map(({ id, name, order, tokenTexts }) => ({
      id, name, order, tokenTexts,
    })),
  });
}
