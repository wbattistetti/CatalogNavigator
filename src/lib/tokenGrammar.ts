/**
 * Token-centric recognition grammars: one grammar per dictionary token,
 * shared by every tree node whose path segment resolves to that token.
 */
import type { AnalysisRow, GrammarEntry } from '../hooks/useAnalysis';
import { normalizeSlotKey } from './analysisTree';
import { ensureGrammarMapsToSelf } from './analyzeAiPostProcess';
import { validateGrammarRegex } from './grammarNormalize';
import { compileSimpleGrammar, expandSegmentVariants } from './grammarSynonyms';
import { isCanonicalToken, type TokenEntry } from './tokenDictionary';

/** Last path segment = canonical token text for that tree level. */
export function getTokenTextForSlot(slotPath: string): string {
  const parts = slotPath.split('.').filter(Boolean);
  return parts[parts.length - 1] ?? slotPath;
}

/** Unique token texts referenced by an slot list (tree order preserved). */
export function collectUniqueTokensFromSlots(slots: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const slot of slots) {
    const token = getTokenTextForSlot(slot);
    const key = normalizeSlotKey(token);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(token);
  }
  return out;
}

/** Default recognition synonyms for a single token (no path context). */
export function defaultSynonymsForToken(tokenText: string): string[] {
  const segment = tokenText.trim();
  return expandSegmentVariants(segment);
}

/** Builds a template grammar stored on the token entry. */
export function buildDefaultTokenGrammar(tokenText: string): GrammarEntry {
  return compileSimpleGrammar(tokenText, defaultSynonymsForToken(tokenText));
}

export function isTokenGrammarComplete(entry: TokenEntry): boolean {
  if (!isCanonicalToken(entry)) return true;
  return !!(
    entry.grammar?.regex?.trim()
    && entry.grammar.mappings
    && Object.keys(entry.grammar.mappings).length > 0
    && validateGrammarRegex(entry.grammar.regex, entry.grammar.mappings).valid
  );
}

/** Index of canonical token text → stored grammar. */
export function buildTokenGrammarIndex(tokens: TokenEntry[]): Map<string, GrammarEntry> {
  const map = new Map<string, GrammarEntry>();
  for (const entry of tokens) {
    if (!isCanonicalToken(entry) || !entry.grammar?.regex?.trim()) continue;
    map.set(entry.text, entry.grammar);
    map.set(normalizeSlotKey(entry.text), entry.grammar);
  }
  return map;
}

/** Remaps token grammar mappings to the concrete node path at runtime. */
export function resolveRecognitionGrammarForSlot(
  slotPath: string,
  tokenGrammar: GrammarEntry | null | undefined,
): GrammarEntry | null {
  if (!tokenGrammar?.regex?.trim()) return null;
  const row = ensureGrammarMapsToSelf({
    slot_filling: slotPath,
    question: null,
    grammar: tokenGrammar,
    answer_grammar: null,
    no_match_1: null,
    no_match_2: null,
    no_match_3: null,
    confirmation_text: null,
    status: null,
  });
  return row.grammar;
}

/** Stored grammar on the canonical token entry (not remapped to a node path). */
export function getStoredTokenGrammar(
  tokenText: string,
  tokens: TokenEntry[],
): GrammarEntry | null {
  const entry = tokens.find((t) => isCanonicalToken(t) && t.text === tokenText);
  return entry?.grammar?.regex?.trim() ? entry.grammar : null;
}

/** Looks up stored grammar for the token at this slot path. */
export function getTokenGrammarForSlot(
  slotPath: string,
  tokens: TokenEntry[],
): GrammarEntry | null {
  const tokenText = getTokenTextForSlot(slotPath);
  const index = buildTokenGrammarIndex(tokens);
  const stored = index.get(tokenText) ?? index.get(normalizeSlotKey(tokenText));
  return resolveRecognitionGrammarForSlot(slotPath, stored);
}

/** Applies template grammars to canonical tokens missing or invalid grammar. */
export function applyTemplateGrammarsToTokens(
  tokens: TokenEntry[],
  overwriteExisting = false,
): TokenEntry[] {
  return tokens.map((entry) => {
    if (!isCanonicalToken(entry)) return entry;
    if (!overwriteExisting && isTokenGrammarComplete(entry)) return entry;
    return { ...entry, grammar: buildDefaultTokenGrammar(entry.text) };
  });
}

/** Sets grammar on a canonical token by text; returns new token array. */
export function setTokenGrammar(
  tokens: TokenEntry[],
  tokenText: string,
  grammar: GrammarEntry,
): TokenEntry[] {
  return tokens.map((entry) => {
    if (!isCanonicalToken(entry) || entry.text !== tokenText) return entry;
    return { ...entry, grammar };
  });
}

/** Copies token grammars onto row.grammar (derived view for display/persistence). */
export function syncRowGrammarsFromTokens(
  rows: AnalysisRow[],
  tokens: TokenEntry[],
): AnalysisRow[] {
  const index = buildTokenGrammarIndex(tokens);
  return rows.map((row) => {
    const tokenText = getTokenTextForSlot(row.slot_filling);
    const stored = index.get(tokenText) ?? index.get(normalizeSlotKey(tokenText));
    const grammar = resolveRecognitionGrammarForSlot(row.slot_filling, stored);
    return { ...row, grammar: grammar ?? row.grammar ?? null };
  });
}

/** Resolves a dictionary token for a tree segment (case/dash insensitive). */
export function resolveCanonicalTokenEntry(
  tokens: TokenEntry[],
  slotTokenText: string,
): TokenEntry | undefined {
  const canonical = tokens.filter(isCanonicalToken);
  const direct = canonical.find((t) => t.text === slotTokenText);
  if (direct) return direct;
  const key = normalizeSlotKey(slotTokenText);
  return canonical.find((t) => normalizeSlotKey(t.text) === key);
}

/** Canonical tokens in the tree that lack a valid grammar. */
export function findTokensMissingGrammar(
  slots: string[],
  tokens: TokenEntry[],
): string[] {
  const needed = collectUniqueTokensFromSlots(slots);
  return needed.filter((text) => {
    const entry = resolveCanonicalTokenEntry(tokens, text);
    return !entry || !isTokenGrammarComplete(entry);
  });
}

/** Slots whose token grammar is missing or invalid (for incremental regen). */
export function findSlotsWithMissingTokenGrammar(
  slots: string[],
  tokens: TokenEntry[],
): string[] {
  const missingTokens = new Set(findTokensMissingGrammar(slots, tokens));
  return slots.filter((slot) => missingTokens.has(getTokenTextForSlot(slot)));
}
