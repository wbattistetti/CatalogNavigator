/**
 * Grammar matching: score each corpus item by how many path nodes match the text;
 * the item with the most matches wins.
 */
import type { AnalysisRow, GrammarEntry } from '../hooks/useAnalysis';
import { normalizeSlotKey } from './analysisTree';
import { extractItemPathsInTree, resolveItemPaths } from './itemPaths';
import { compileGrammarRegex, normalizeGrammarEntry } from './grammarNormalize';
import {
  buildTokenGrammarIndex,
  getTokenTextForSlot,
  resolveRecognitionGrammarForSlot,
} from './tokenGrammar';
import type { TokenEntry } from './tokenDictionary';

export interface GrammarMatchResult {
  targetPath: string | null;
  matchedLength?: number;
  regexError?: string;
  mappingMiss?: string;
}

export interface ItemGrammarMatchResult {
  targetPath: string | null;
  matchCount?: number;
  regexError?: string;
}

export interface MatchBestItemOptions {
  anchorPath?: string | null;
  itemPaths?: string[] | null;
  /** Canonical token grammars — preferred over row.grammar when matching. */
  tokens?: TokenEntry[] | null;
}

function resolveRowRecognitionGrammar(
  slot: string,
  row: AnalysisRow | undefined,
  tokenIndex: Map<string, GrammarEntry>,
): GrammarEntry | null {
  const tokenText = getTokenTextForSlot(slot);
  const stored = tokenIndex.get(tokenText) ?? tokenIndex.get(normalizeSlotKey(tokenText));
  const fromToken = resolveRecognitionGrammarForSlot(slot, stored);
  if (fromToken) return fromToken;
  return row?.grammar?.regex?.trim() ? row.grammar : null;
}

function matchGrammarAtSlot(
  input: string,
  slot: string,
  row: AnalysisRow | undefined,
  tokenIndex: Map<string, GrammarEntry>,
): GrammarMatchResult {
  const grammar = resolveRowRecognitionGrammar(slot, row, tokenIndex);
  if (!grammar) return { targetPath: null };
  return matchGrammarInput(input, {
    slot_filling: slot,
    question: null,
    grammar,
    answer_grammar: null,
    no_match_1: null,
    no_match_2: null,
    no_match_3: null,
    confirmation_text: null,
    status: null,
  });
}

function pathPrefixesInTree(targetPath: string, slots: string[]): string[] {
  const parts = targetPath.split('.').filter(Boolean);
  const prefixes: string[] = [];
  for (let i = 1; i <= parts.length; i++) {
    const prefix = parts.slice(0, i).join('.');
    if (slots.includes(prefix)) prefixes.push(prefix);
  }
  return prefixes;
}

/** Matches input against a single row's grammar. */
export function matchGrammarInput(input: string, row: AnalysisRow): GrammarMatchResult {
  if (!row.grammar?.regex?.trim()) {
    return { targetPath: null };
  }

  const grammar = normalizeGrammarEntry(row.grammar);

  let re: RegExp;
  try {
    re = compileGrammarRegex(grammar.regex);
  } catch (err) {
    return {
      targetPath: null,
      regexError: err instanceof Error ? err.message : String(err),
    };
  }

  const trimmed = input.trim();
  const match = re.exec(trimmed);
  if (!match?.groups) {
    return { targetPath: null };
  }

  const matched = Object.entries(match.groups).find(([, value]) => value !== undefined);
  if (!matched) {
    return { targetPath: null };
  }

  const [groupName] = matched;
  const mapped = grammar.mappings[groupName]?.trim();
  const targetPath = mapped || row.slot_filling;

  if (!targetPath) {
    return { targetPath: null, mappingMiss: groupName };
  }

  return {
    targetPath,
    matchedLength: match[0]?.length ?? 0,
  };
}

interface ItemScore {
  itemPath: string;
  matchCount: number;
  totalMatchLen: number;
  deepestMatched: string | null;
}

function scoreItemPath(
  itemPath: string,
  slots: string[],
  input: string,
  rowBySlot: Map<string, AnalysisRow>,
  tokenIndex: Map<string, GrammarEntry>,
): ItemScore {
  const prefixes = pathPrefixesInTree(itemPath, slots);
  let matchCount = 0;
  let totalMatchLen = 0;
  let deepestMatched: string | null = null;

  for (const slot of prefixes) {
    const row = rowBySlot.get(slot);
    const result = matchGrammarAtSlot(input, slot, row, tokenIndex);
    if (!result.targetPath) continue;
    matchCount += 1;
    totalMatchLen += result.matchedLength ?? 0;
    deepestMatched = slot;
  }

  return { itemPath, matchCount, totalMatchLen, deepestMatched };
}

function leafMatchesAnchor(itemPath: string, anchorPath: string): boolean {
  return itemPath === anchorPath || itemPath.startsWith(`${anchorPath}.`);
}

/** Picks the best-scoring candidate item path. */
function pickWinningScore(candidates: ItemScore[], anchor: string | null): ItemScore {
  const sorted = [...candidates].sort((a, b) => {
    if (anchor) {
      const aAnchor = leafMatchesAnchor(a.itemPath, anchor) ? 1 : 0;
      const bAnchor = leafMatchesAnchor(b.itemPath, anchor) ? 1 : 0;
      if (aAnchor !== bAnchor) return bAnchor - aAnchor;
    }
    if (b.totalMatchLen !== a.totalMatchLen) return b.totalMatchLen - a.totalMatchLen;
    return a.itemPath.localeCompare(b.itemPath, 'it', { sensitivity: 'base' });
  });
  return sorted[0]!;
}

export interface CandidateItemMatch {
  paths: string[];
  maxCount: number;
  scores: ItemScore[];
}

/** Returns all item paths tied at the maximum prefix match count. */
export function matchCandidateItemPaths(
  input: string,
  rows: AnalysisRow[],
  options?: MatchBestItemOptions,
): CandidateItemMatch {
  const slots = rows.map((r) => r.slot_filling);
  const itemPaths = extractItemPathsInTree(slots, resolveItemPaths(slots, options?.itemPaths));
  if (itemPaths.length === 0) {
    return { paths: [], maxCount: 0, scores: [] };
  }

  const rowBySlot = new Map(rows.map((r) => [r.slot_filling, r]));
  const tokenIndex = buildTokenGrammarIndex(options?.tokens ?? []);
  const scores = itemPaths.map((item) =>
    scoreItemPath(item, slots, input, rowBySlot, tokenIndex),
  );
  const maxCount = Math.max(...scores.map((s) => s.matchCount));
  if (maxCount === 0) {
    return { paths: [], maxCount: 0, scores };
  }

  const paths = scores
    .filter((s) => s.matchCount === maxCount)
    .map((s) => s.itemPath);
  return { paths, maxCount, scores };
}

/**
 * Scores every corpus item by counting how many nodes on its path match the input.
 * Returns the deepest matched node on the winning item's path as navigation target.
 */
export function matchBestItemPath(
  input: string,
  rows: AnalysisRow[],
  options?: MatchBestItemOptions,
): ItemGrammarMatchResult {
  const slots = rows.map((r) => r.slot_filling);
  const itemPaths = extractItemPathsInTree(slots, resolveItemPaths(slots, options?.itemPaths));
  if (itemPaths.length === 0) {
    return { targetPath: null };
  }

  const rowBySlot = new Map(rows.map((r) => [r.slot_filling, r]));
  const tokenIndex = buildTokenGrammarIndex(options?.tokens ?? []);
  let firstRegexError: string | undefined;
  let compilableGrammars = 0;

  for (const slot of slots) {
    const row = rowBySlot.get(slot);
    const grammar = resolveRowRecognitionGrammar(slot, row, tokenIndex);
    if (!grammar?.regex?.trim()) continue;
    const probe = matchGrammarInput(input, {
      slot_filling: slot,
      question: null,
      grammar,
      answer_grammar: null,
      no_match_1: null,
      no_match_2: null,
      no_match_3: null,
      confirmation_text: null,
      status: null,
    });
    if (probe.regexError) {
      if (!firstRegexError) firstRegexError = probe.regexError;
    } else {
      compilableGrammars += 1;
    }
  }

  const scores = itemPaths.map((item) =>
    scoreItemPath(item, slots, input, rowBySlot, tokenIndex),
  );
  const maxCount = Math.max(...scores.map((s) => s.matchCount));
  if (maxCount === 0) {
    return {
      targetPath: null,
      regexError: compilableGrammars > 0 ? undefined : firstRegexError,
    };
  }

  const anchor = options?.anchorPath?.trim() || null;
  const candidates = scores.filter((s) => s.matchCount === maxCount);
  const winner = pickWinningScore(candidates, anchor);
  const targetPath = winner.deepestMatched ?? winner.itemPath;

  return {
    targetPath,
    matchCount: winner.matchCount,
    regexError: undefined,
  };
}

/** @deprecated Use matchBestItemPath — kept as alias for callers. */
export function matchLongestGrammarPath(
  input: string,
  rows: AnalysisRow[],
  options?: MatchBestItemOptions,
): ItemGrammarMatchResult {
  return matchBestItemPath(input, rows, options);
}
