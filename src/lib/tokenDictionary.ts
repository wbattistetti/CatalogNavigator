/**
 * Corpus-driven token dictionary and deterministic longest-match segmentation.
 */

export interface TokenEntry {
  text: string;
  enabled: boolean;
  /** Shorter token disabled because a longer dictionary token contains it. */
  suppressedBy?: string;
}

export interface TokenDictionary {
  descriptionColumn: string;
  tokens: TokenEntry[];
}

export interface SegmentationResult {
  segments: string[];
  path: string;
  unmatched: string[];
}

const PUNCTUATION_RE = /[.,;:!?()[\]{}"'\/\\|+\-–—]+/g;

/** Normalizes description text for tokenization. */
export function normalizeDescriptionText(text: string): string {
  return text
    .toLowerCase()
    .replace(PUNCTUATION_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalizes a user text selection into a dictionary token phrase. */
export function selectionToTokenPhrase(selectedText: string): string | null {
  const phrase = normalizeDescriptionText(selectedText);
  return phrase || null;
}

function wordCount(text: string): number {
  return text.split(' ').filter(Boolean).length;
}

/** Contiguous proper sub-phrases (for cascade). */
function contiguousSubphrases(text: string): string[] {
  const words = text.split(' ').filter(Boolean);
  const out: string[] = [];
  for (let len = 1; len < words.length; len++) {
    for (let i = 0; i <= words.length - len; i++) {
      out.push(words.slice(i, i + len).join(' '));
    }
  }
  return out;
}

/**
 * Longer active tokens suppress shorter dictionary tokens they contain.
 */
export function applySuppressionCascade(tokens: TokenEntry[]): TokenEntry[] {
  const next = tokens.map((t) => ({
    ...t,
    enabled: true,
    suppressedBy: undefined as string | undefined,
  }));

  const suppressors = [...next].sort((a, b) => {
    const wa = wordCount(a.text);
    const wb = wordCount(b.text);
    if (wb !== wa) return wb - wa;
    return b.text.length - a.text.length;
  });

  for (const long of suppressors) {
    for (const sub of contiguousSubphrases(long.text)) {
      const target = next.find((t) => t.text === sub);
      if (!target) continue;
      target.enabled = false;
      target.suppressedBy = long.text;
    }
  }

  return next;
}

/** Adds a token from manual selection; dedupes and applies cascade. */
export function addToken(tokens: TokenEntry[], rawPhrase: string): TokenEntry[] {
  const text = selectionToTokenPhrase(rawPhrase);
  if (!text) throw new Error('Selezione vuota o non valida');
  if (tokens.some((t) => t.text === text)) return applySuppressionCascade(tokens);
  return applySuppressionCascade([...tokens, { text, enabled: true }]);
}

/** Removes a token and reapplies cascade. */
export function removeToken(tokens: TokenEntry[], text: string): TokenEntry[] {
  return applySuppressionCascade(tokens.filter((t) => t.text !== text));
}

/** Active token phrases for matching, longest first. */
export function getActiveTokens(tokens: TokenEntry[]): string[] {
  return tokens
    .filter((t) => t.enabled)
    .sort((a, b) => {
      const wa = wordCount(a.text);
      const wb = wordCount(b.text);
      if (wb !== wa) return wb - wa;
      return b.text.length - a.text.length;
    })
    .map((t) => t.text);
}

function wordsMatch(tokenWords: string[], start: number, phrase: string): boolean {
  const parts = phrase.split(' ').filter(Boolean);
  if (start + parts.length > tokenWords.length) return false;
  return parts.every((w, i) => tokenWords[start + i] === w);
}

/** Greedy longest-match segmentation on a word array. */
export function segmentWords(words: string[], activeTokens: string[]): {
  segments: string[];
  unmatched: string[];
} {
  const segments: string[] = [];
  const unmatched: string[] = [];
  let i = 0;

  while (i < words.length) {
    let matched: string | null = null;
    for (const token of activeTokens) {
      if (wordsMatch(words, i, token)) {
        matched = token;
        i += token.split(' ').filter(Boolean).length;
        break;
      }
    }
    if (matched) {
      segments.push(matched);
    } else {
      unmatched.push(words[i]!);
      i += 1;
    }
  }

  return { segments, unmatched };
}

/** Segments one description into dot-separated path segments. */
export function segmentDescription(text: string, activeTokens: string[]): SegmentationResult {
  const normalized = normalizeDescriptionText(text);
  if (!normalized) {
    return { segments: [], path: '', unmatched: [] };
  }

  const clauses = normalized.split(/[,;]+/).map((c) => c.trim()).filter(Boolean);
  const allSegments: string[] = [];
  const allUnmatched: string[] = [];

  for (const clause of clauses) {
    const words = clause.split(' ').filter(Boolean);
    const { segments, unmatched } = segmentWords(words, activeTokens);
    allSegments.push(...segments);
    allUnmatched.push(...unmatched);
  }

  return {
    segments: allSegments,
    path: allSegments.join('.'),
    unmatched: [...new Set(allUnmatched)],
  };
}

/** Matched dictionary tokens in order (one entry per tree level). */
export function getTokenBullets(text: string, activeTokens: string[]): string[] {
  if (activeTokens.length === 0) return [];
  return segmentDescription(text, activeTokens).segments;
}

export function buildEmptyDictionary(descriptionColumn: string): TokenDictionary {
  return { descriptionColumn, tokens: [] };
}

/** Loads tokens from persisted dictionary (migrates legacy n-gram format). */
export function loadSavedTokens(
  saved: { descriptionColumn: string; entries?: LegacySavedEntry[]; tokens?: TokenEntry[] } | null | undefined,
  descriptionColumn: string,
): TokenEntry[] {
  if (!saved || saved.descriptionColumn !== descriptionColumn) return [];

  const raw = saved.tokens ?? saved.entries ?? [];
  const migrated: TokenEntry[] = [];

  for (const item of raw) {
    const text = normalizeDescriptionText(item.text);
    if (!text) continue;

    if ('n' in item && item.n !== undefined) {
      const legacy = item as LegacyNgramEntry;
      const active = legacy.manualOverride !== 'off' && (legacy.manualOverride === 'on' || legacy.enabled !== false);
      if (!active) continue;
    }

    if (migrated.some((t) => t.text === text)) continue;
    migrated.push({
      text,
      enabled: item.enabled !== false,
      suppressedBy: item.suppressedBy,
    });
  }

  return applySuppressionCascade(migrated);
}

/** All dictionary tokens sorted alphabetically (includes cascade-suppressed). */
export function listAllTokensSorted(tokens: TokenEntry[]): TokenEntry[] {
  return [...tokens].sort((a, b) =>
    a.text.localeCompare(b.text, 'it', { sensitivity: 'base' }),
  );
}

interface LegacySavedEntry {
  text: string;
  enabled?: boolean;
  suppressedBy?: string;
}

interface LegacyNgramEntry extends LegacySavedEntry {
  n?: number;
  manualOverride?: 'on' | 'off' | null;
}

export interface RowSegmentation {
  rowIndex: number;
  sourceText: string;
  path: string;
  unmatched: string[];
}

/** Segments all descriptions using the validated dictionary. */
export function segmentAllDescriptions(
  descriptions: string[],
  tokens: TokenEntry[],
): { leafPaths: string[]; rows: RowSegmentation[] } {
  const activeTokens = getActiveTokens(tokens);
  const rows: RowSegmentation[] = [];
  const leafPaths: string[] = [];

  descriptions.forEach((sourceText, rowIndex) => {
    const trimmed = sourceText.trim();
    if (!trimmed) return;
    const result = segmentDescription(trimmed, activeTokens);
    if (result.path) {
      leafPaths.push(result.path);
      rows.push({ rowIndex, sourceText: trimmed, path: result.path, unmatched: result.unmatched });
    }
  });

  return { leafPaths, rows };
}

/** Maps leaf slot paths to corpus descriptions (joins duplicates with "; "). */
export function buildLeafDescriptionMap(rows: RowSegmentation[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const existing = map.get(row.path);
    map.set(row.path, existing ? `${existing}; ${row.sourceText}` : row.sourceText);
  }
  return map;
}

function escapeRegexChar(ch: string): string {
  return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive regex matching a phrase with flexible whitespace/punctuation. */
export function buildPhraseHighlightRegex(phrase: string): RegExp | null {
  const parts = phrase.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const pattern = parts.map(escapeRegexChar).join('[\\s,;:]+');
  return new RegExp(pattern, 'gi');
}

export interface HighlightSpan {
  start: number;
  end: number;
  token: string;
}

/** Finds non-overlapping highlight spans in source text (prefers longer tokens). */
export function findHighlightSpans(sourceText: string, activeTokens: string[]): HighlightSpan[] {
  if (activeTokens.length === 0) return [];

  const candidates: HighlightSpan[] = [];
  for (const token of activeTokens) {
    const re = buildPhraseHighlightRegex(token);
    if (!re) continue;
    let match: RegExpExecArray | null;
    while ((match = re.exec(sourceText)) !== null) {
      candidates.push({ start: match.index, end: match.index + match[0].length, token });
    }
  }

  candidates.sort((a, b) => {
    const lenA = a.end - a.start;
    const lenB = b.end - b.start;
    if (lenB !== lenA) return lenB - lenA;
    return a.start - b.start;
  });

  const chosen: HighlightSpan[] = [];
  for (const c of candidates) {
    const overlaps = chosen.some((h) => c.start < h.end && c.end > h.start);
    if (!overlaps) chosen.push(c);
  }

  return chosen.sort((a, b) => a.start - b.start);
}
