/**
 * Grammar matching: score each leaf item by how many path nodes match the text;
 * the item with the most matches wins (not deepest single node).
 */
import type { AnalysisRow } from '../hooks/useAnalysis';
import { extractLeafPaths } from './analysisTree';
import { compileGrammarRegex, normalizeGrammarEntry } from './grammarNormalize';

export interface GrammarMatchResult {
  targetPath: string | null;
  /** Length of the regex match in the input (for tie-breaking). */
  matchedLength?: number;
  /** Set when the regex string cannot be compiled. */
  regexError?: string;
  /** Set when a group matched but has no mapping entry. */
  mappingMiss?: string;
}

export interface ItemGrammarMatchResult {
  targetPath: string | null;
  /** Number of grammars matched on the winning item's path. */
  matchCount?: number;
  regexError?: string;
}

export interface MatchBestItemOptions {
  /** When scores tie, prefer a leaf under this path (conversation context). */
  anchorPath?: string | null;
}

/** Prefix slots from root to target (inclusive), only if they exist in the tree. */
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

interface LeafScore {
  leafPath: string;
  matchCount: number;
  totalMatchLen: number;
  deepestMatched: string | null;
}

function scoreLeafItem(
  leafPath: string,
  rows: AnalysisRow[],
  slots: string[],
  input: string,
  rowBySlot: Map<string, AnalysisRow>,
): LeafScore {
  const prefixes = pathPrefixesInTree(leafPath, slots);
  let matchCount = 0;
  let totalMatchLen = 0;
  let deepestMatched: string | null = null;

  for (const slot of prefixes) {
    const row = rowBySlot.get(slot);
    if (!row) continue;
    const result = matchGrammarInput(input, row);
    if (!result.targetPath) continue;
    matchCount += 1;
    totalMatchLen += result.matchedLength ?? 0;
    deepestMatched = slot;
  }

  return { leafPath, matchCount, totalMatchLen, deepestMatched };
}

function leafMatchesAnchor(leafPath: string, anchorPath: string): boolean {
  return leafPath === anchorPath || leafPath.startsWith(`${anchorPath}.`);
}

/**
 * Scores every leaf item by counting how many nodes on its path match the input.
 * Returns the deepest matched node on the winning item's path as navigation target.
 */
export function matchBestItemPath(
  input: string,
  rows: AnalysisRow[],
  options?: MatchBestItemOptions,
): ItemGrammarMatchResult {
  const slots = rows.map((r) => r.slot_filling);
  const leaves = extractLeafPaths(slots);
  if (leaves.length === 0) {
    return { targetPath: null };
  }

  const rowBySlot = new Map(rows.map((r) => [r.slot_filling, r]));
  let firstRegexError: string | undefined;
  let compilableGrammars = 0;

  for (const row of rows) {
    if (!row.grammar?.regex?.trim()) continue;
    const probe = matchGrammarInput(input, row);
    if (probe.regexError) {
      if (!firstRegexError) firstRegexError = probe.regexError;
    } else {
      compilableGrammars += 1;
    }
  }

  const scores = leaves.map((leaf) => scoreLeafItem(leaf, rows, slots, input, rowBySlot));
  const maxCount = Math.max(...scores.map((s) => s.matchCount));
  if (maxCount === 0) {
    return {
      targetPath: null,
      regexError: compilableGrammars > 0 ? undefined : firstRegexError,
    };
  }

  const anchor = options?.anchorPath?.trim() || null;
  const candidates = scores.filter((s) => s.matchCount === maxCount);

  candidates.sort((a, b) => {
    if (anchor) {
      const aAnchor = leafMatchesAnchor(a.leafPath, anchor) ? 1 : 0;
      const bAnchor = leafMatchesAnchor(b.leafPath, anchor) ? 1 : 0;
      if (aAnchor !== bAnchor) return bAnchor - aAnchor;
    }
    if (b.totalMatchLen !== a.totalMatchLen) return b.totalMatchLen - a.totalMatchLen;
    return a.leafPath.localeCompare(b.leafPath, 'it', { sensitivity: 'base' });
  });

  const winner = candidates[0]!;
  const targetPath = winner.deepestMatched ?? winner.leafPath;

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
