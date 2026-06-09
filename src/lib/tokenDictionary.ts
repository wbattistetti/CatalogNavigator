/**
 * Corpus-driven token dictionary and deterministic longest-match segmentation.
 */
import type { TokenCategory } from './dictionaryTree';
import { orderSegmentsByCategories, type SegmentMatch } from './dictionaryTree';

export type { TokenCategory } from './dictionaryTree';

export interface TokenEntry {
  text: string;
  enabled: boolean;
  /** Shorter token disabled because a longer dictionary token contains it. */
  suppressedBy?: string;
}

export interface TokenDictionary {
  descriptionColumn: string;
  tokens: TokenEntry[];
  /** Category order controls segment mounting order in paths (not path prefixes). */
  categories: TokenCategory[];
}

export interface SegmentationResult {
  segments: string[];
  path: string;
  unmatched: string[];
}

const PUNCTUATION_RE = /[.,;:!?()[\]{}"'\/\\|+\-–—]+/g;

function isWordChar(ch: string): boolean {
  return /[\p{L}\p{N}]/u.test(ch);
}

export interface SelectionRange {
  sourceText: string;
  start: number;
  end: number;
}

/**
 * Trims a selection to whole words only, dropping partial overflow from adjacent words.
 */
export function trimSelectionRange(sourceText: string, start: number, end: number): SelectionRange {
  let s = Math.max(0, Math.min(start, sourceText.length));
  let e = Math.max(s, Math.min(end, sourceText.length));

  if (s < e && s > 0 && isWordChar(sourceText[s]!) && isWordChar(sourceText[s - 1]!)) {
    while (s < e && isWordChar(sourceText[s]!)) s++;
    while (s < e && !isWordChar(sourceText[s]!)) s++;
  }

  if (e > s && e < sourceText.length && isWordChar(sourceText[e - 1]!) && isWordChar(sourceText[e]!)) {
    while (e > s && isWordChar(sourceText[e - 1]!)) e--;
  }

  while (s < e && !isWordChar(sourceText[s]!)) s++;
  while (e > s && !isWordChar(sourceText[e - 1]!)) e--;

  return { sourceText, start: s, end: e };
}

/** Maps a DOM text selection to character offsets inside sourceText. */
export function getSelectionOffsetsInElement(
  container: HTMLElement,
  sourceText: string,
): SelectionRange | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;

  const range = sel.getRangeAt(0);
  if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) {
    return null;
  }

  const start = textOffsetInElement(container, range.startContainer, range.startOffset);
  const end = textOffsetInElement(container, range.endContainer, range.endOffset);
  if (start < 0 || end < 0 || start === end) return null;

  const normalized = trimSelectionRange(sourceText, Math.min(start, end), Math.max(start, end));
  if (normalized.start >= normalized.end) return null;
  return normalized;
}

function textOffsetInElement(root: HTMLElement, node: Node, offset: number): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let current = walker.nextNode();
  while (current) {
    if (current === node) return pos + offset;
    pos += current.textContent?.length ?? 0;
    current = walker.nextNode();
  }
  return -1;
}

/** Normalizes description text for tokenization. */
export function normalizeDescriptionText(text: string): string {
  return text
    .toLowerCase()
    .replace(PUNCTUATION_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalizes a user text selection into a dictionary token phrase. */
export function selectionToTokenPhrase(
  selectedText: string,
  range?: SelectionRange | null,
): string | null {
  if (range) {
    const trimmed = trimSelectionRange(range.sourceText, range.start, range.end);
    if (trimmed.start >= trimmed.end) return null;
    const slice = trimmed.sourceText.slice(trimmed.start, trimmed.end);
    const phrase = normalizeDescriptionText(slice);
    return phrase || null;
  }
  const phrase = normalizeDescriptionText(selectedText);
  return phrase || null;
}

/** Splits normalized text into whole words (never character fragments inside a word). */
export function tokenizeToWords(text: string): string[] {
  return text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function wordCount(text: string): number {
  return tokenizeToWords(text).length;
}

/** True when [start, end) in text spans complete word(s), not a substring inside a word. */
export function isWholeWordSpan(text: string, start: number, end: number): boolean {
  if (start < 0 || end > text.length || start >= end) return false;
  if (start > 0 && isWordChar(text[start - 1]!)) return false;
  if (end < text.length && isWordChar(text[end]!)) return false;
  return true;
}

/** Contiguous proper sub-phrases (for cascade). */
function contiguousSubphrases(text: string): string[] {
  const words = tokenizeToWords(text);
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
export function addToken(
  tokens: TokenEntry[],
  rawPhrase: string,
  range?: SelectionRange | null,
): TokenEntry[] {
  const text = selectionToTokenPhrase(rawPhrase, range);
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

/** Matches a dictionary token only against consecutive whole words (exact equality per word). */
function wordsMatch(tokenWords: string[], start: number, phrase: string): boolean {
  const parts = tokenizeToWords(phrase);
  if (parts.length === 0 || start + parts.length > tokenWords.length) return false;
  return parts.every((w, i) => tokenWords[start + i] === w);
}

/** Greedy longest-match segmentation on a word array (with match positions). */
export function segmentWordsWithPositions(words: string[], activeTokens: string[]): {
  matches: SegmentMatch[];
  unmatched: string[];
} {
  const matches: SegmentMatch[] = [];
  const unmatched: string[] = [];
  let i = 0;

  while (i < words.length) {
    let matched: string | null = null;
    for (const token of activeTokens) {
      if (wordsMatch(words, i, token)) {
        matched = token;
        break;
      }
    }
    if (matched) {
      matches.push({ text: matched, wordStartIndex: i });
      i += tokenizeToWords(matched).length;
    } else {
      unmatched.push(words[i]!);
      i += 1;
    }
  }

  return { matches, unmatched };
}

/** Greedy longest-match segmentation on a word array. */
export function segmentWords(words: string[], activeTokens: string[]): {
  segments: string[];
  unmatched: string[];
} {
  const { matches, unmatched } = segmentWordsWithPositions(words, activeTokens);
  return { segments: matches.map((m) => m.text), unmatched };
}

/**
 * Segments one description row into dot-separated path segments.
 * One row = one item; segment order follows category order (uncategorized tokens last).
 */
export function segmentDescription(
  text: string,
  activeTokens: string[],
  categories: TokenCategory[] = [],
): SegmentationResult {
  const normalized = normalizeDescriptionText(text);
  if (!normalized) {
    return { segments: [], path: '', unmatched: [] };
  }

  const words = tokenizeToWords(normalized);
  const { matches, unmatched } = segmentWordsWithPositions(words, activeTokens);
  const segments = orderSegmentsByCategories(matches, categories);

  return {
    segments,
    path: segments.join('.'),
    unmatched: [...new Set(unmatched)],
  };
}

/** Matched dictionary tokens in order (one entry per tree level). */
export function getTokenBullets(
  text: string,
  activeTokens: string[],
  categories: TokenCategory[] = [],
): string[] {
  if (activeTokens.length === 0) return [];
  return segmentDescription(text, activeTokens, categories).segments;
}

export function buildEmptyDictionary(descriptionColumn: string): TokenDictionary {
  return { descriptionColumn, tokens: [], categories: [] };
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
  categories: TokenCategory[] = [],
): { leafPaths: string[]; rows: RowSegmentation[] } {
  const activeTokens = getActiveTokens(tokens);
  const rows: RowSegmentation[] = [];
  const leafPaths: string[] = [];

  descriptions.forEach((sourceText, rowIndex) => {
    const trimmed = sourceText.trim();
    if (!trimmed) return;
    const result = segmentDescription(trimmed, activeTokens, categories);
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

/** Case-insensitive regex matching a phrase on whole words only (no sub-word matches). */
export function buildPhraseHighlightRegex(phrase: string): RegExp | null {
  const parts = tokenizeToWords(phrase);
  if (parts.length === 0) return null;
  const wordBoundaryStart = '(?<![\\p{L}\\p{N}])';
  const wordBoundaryEnd = '(?![\\p{L}\\p{N}])';
  const pattern = parts
    .map((p) => `${wordBoundaryStart}${escapeRegexChar(p)}${wordBoundaryEnd}`)
    .join('[\\s,;:]+');
  return new RegExp(pattern, 'giu');
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
      const start = match.index;
      const end = start + match[0].length;
      if (!isWholeWordSpan(sourceText, start, end)) continue;
      candidates.push({ start, end, token });
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
