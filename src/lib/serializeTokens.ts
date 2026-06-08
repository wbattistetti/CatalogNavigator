/**
 * Serializes token entries for dirty-state comparison.
 */
import type { TokenEntry } from './tokenDictionary';

export function serializeTokenEntries(tokens: TokenEntry[]): string {
  return JSON.stringify(
    tokens.map(({ text, enabled, suppressedBy }) => ({ text, enabled, suppressedBy })),
  );
}
