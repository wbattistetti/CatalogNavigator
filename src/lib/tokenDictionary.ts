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
  /** Surface phrase that maps to another canonical token (synonym). */
  aliasOf?: string;
}

/** Phrase matched in corpus text and its canonical token for path segmentation. */
export interface MatchPhrase {
  phrase: string;
  canonical: string;
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

/** Short parenthetical hint on alias chips (first word of the canonical token). */
export function aliasCanonicalHint(canonical: string): string {
  const words = tokenizeToWords(canonical);
  return words[0] ?? canonical;
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

function sortByPhraseLengthDesc(a: { text: string }, b: { text: string }): number {
  const wa = wordCount(a.text);
  const wb = wordCount(b.text);
  if (wb !== wa) return wb - wa;
  return b.text.length - a.text.length;
}

/**
 * Longer active tokens suppress shorter dictionary tokens they contain.
 * Aliases are preserved as-is and do not participate in cascade.
 */
export function applySuppressionCascade(tokens: TokenEntry[]): TokenEntry[] {
  const aliases = tokens.filter((t) => t.aliasOf);
  const next = tokens
    .filter((t) => !t.aliasOf)
    .map((t) => ({
      ...t,
      enabled: true,
      suppressedBy: undefined as string | undefined,
    }));

  const suppressors = [...next].sort(sortByPhraseLengthDesc);

  for (const long of suppressors) {
    for (const sub of contiguousSubphrases(long.text)) {
      const target = next.find((t) => t.text === sub);
      if (!target) continue;
      target.enabled = false;
      target.suppressedBy = long.text;
    }
  }

  return [...next, ...aliases];
}

/** True when the entry is a canonical token (not an alias surface phrase). */
export function isCanonicalToken(entry: TokenEntry): boolean {
  return !entry.aliasOf;
}

/** Active canonical token phrases, longest first (excludes aliases). */
export function getActiveTokens(tokens: TokenEntry[]): string[] {
  return tokens
    .filter((t) => t.enabled && isCanonicalToken(t))
    .sort(sortByPhraseLengthDesc)
    .map((t) => t.text);
}

/** Active match phrases (canonical + aliases), longest first. */
export function getActiveMatchPhrases(tokens: TokenEntry[]): MatchPhrase[] {
  const canonicalActive = new Set(
    tokens.filter((t) => t.enabled && isCanonicalToken(t)).map((t) => t.text),
  );
  const phrases: MatchPhrase[] = [];

  for (const t of tokens) {
    if (t.aliasOf) {
      if (!canonicalActive.has(t.aliasOf)) continue;
      phrases.push({ phrase: t.text, canonical: t.aliasOf });
      continue;
    }
    if (t.enabled) {
      phrases.push({ phrase: t.text, canonical: t.text });
    }
  }

  return phrases.sort((a, b) => {
    const wa = wordCount(a.phrase);
    const wb = wordCount(b.phrase);
    if (wb !== wa) return wb - wa;
    return b.phrase.length - a.phrase.length;
  });
}

/** Canonical tokens sorted for alias picker (excludes aliases). */
export function listCanonicalTokensSorted(tokens: TokenEntry[]): TokenEntry[] {
  return tokens
    .filter(isCanonicalToken)
    .sort((a, b) => a.text.localeCompare(b.text, 'it', { sensitivity: 'base' }));
}

/** Adds a token from manual selection; dedupes and applies cascade. */
export function addToken(
  tokens: TokenEntry[],
  rawPhrase: string,
  range?: SelectionRange | null,
): TokenEntry[] {
  const text = selectionToTokenPhrase(rawPhrase, range);
  if (!text) throw new Error('Selezione vuota o non valida');
  if (tokens.some((t) => t.text === text && isCanonicalToken(t))) {
    return applySuppressionCascade(tokens);
  }
  const without = tokens.filter((t) => t.text !== text);
  return applySuppressionCascade([...without, { text, enabled: true }]);
}

/** Adds an alias surface phrase pointing to a canonical token. */
export function addAlias(
  tokens: TokenEntry[],
  rawPhrase: string,
  canonicalText: string,
  range?: SelectionRange | null,
): TokenEntry[] {
  const text = selectionToTokenPhrase(rawPhrase, range);
  if (!text) throw new Error('Selezione vuota o non valida');

  const canonical = normalizeDescriptionText(canonicalText);
  if (!canonical) throw new Error('Token canonico non valido');
  if (text === canonical) throw new Error('Un alias non può coincidere col token');

  const canonicalEntry = tokens.find((t) => t.text === canonical && isCanonicalToken(t));
  if (!canonicalEntry) throw new Error('Token canonico inesistente');

  if (tokens.some((t) => t.text === text && isCanonicalToken(t))) {
    throw new Error('La selezione è già un token canonico');
  }

  const without = tokens.filter((t) => t.text !== text);
  return [...without, { text, enabled: true, aliasOf: canonical }];
}

/** Removes only an alias surface entry; canonical tokens are untouched. */
export function removeAlias(tokens: TokenEntry[], aliasText: string): TokenEntry[] {
  return tokens.filter((t) => !(t.text === aliasText && t.aliasOf));
}

/** Removes only a canonical token; linked aliases are preserved. */
export function removeCanonicalToken(tokens: TokenEntry[], text: string): TokenEntry[] {
  const filtered = tokens.filter((t) => !(t.text === text && isCanonicalToken(t)));
  return applySuppressionCascade(filtered);
}

/** Matches a dictionary token only against consecutive whole words (exact equality per word). */
function wordsMatch(tokenWords: string[], start: number, phrase: string): boolean {
  const parts = tokenizeToWords(phrase);
  if (parts.length === 0 || start + parts.length > tokenWords.length) return false;
  return parts.every((w, i) => tokenWords[start + i] === w);
}

/** Greedy longest-match segmentation on a word array (with match positions). */
export function segmentWordsWithPositions(words: string[], matchPhrases: MatchPhrase[]): {
  matches: SegmentMatch[];
  unmatched: string[];
} {
  const matches: SegmentMatch[] = [];
  const unmatched: string[] = [];
  let i = 0;

  while (i < words.length) {
    let matched: MatchPhrase | null = null;
    for (const rule of matchPhrases) {
      if (wordsMatch(words, i, rule.phrase)) {
        matched = rule;
        break;
      }
    }
    if (matched) {
      matches.push({ text: matched.canonical, wordStartIndex: i });
      i += tokenizeToWords(matched.phrase).length;
    } else {
      unmatched.push(words[i]!);
      i += 1;
    }
  }

  return { matches, unmatched };
}

/** Greedy longest-match segmentation on a word array. */
export function segmentWords(words: string[], matchPhrases: MatchPhrase[]): {
  segments: string[];
  unmatched: string[];
} {
  const { matches, unmatched } = segmentWordsWithPositions(words, matchPhrases);
  return { segments: matches.map((m) => m.text), unmatched };
}

/**
 * Segments one description row into dot-separated path segments.
 * One row = one item; segment order follows category order (uncategorized tokens last).
 */
export function segmentDescription(
  text: string,
  tokens: TokenEntry[],
  categories: TokenCategory[] = [],
): SegmentationResult {
  const normalized = normalizeDescriptionText(text);
  if (!normalized) {
    return { segments: [], path: '', unmatched: [] };
  }

  const matchPhrases = getActiveMatchPhrases(tokens);
  const words = tokenizeToWords(normalized);
  const { matches, unmatched } = segmentWordsWithPositions(words, matchPhrases);
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
  tokens: TokenEntry[],
  categories: TokenCategory[] = [],
): string[] {
  if (getActiveMatchPhrases(tokens).length === 0) return [];
  return segmentDescription(text, tokens, categories).segments;
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
      aliasOf: item.aliasOf ? normalizeDescriptionText(item.aliasOf) : undefined,
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
  aliasOf?: string;
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
  const rows: RowSegmentation[] = [];
  const leafPaths: string[] = [];

  descriptions.forEach((sourceText, rowIndex) => {
    const trimmed = sourceText.trim();
    if (!trimmed) return;
    const result = segmentDescription(trimmed, tokens, categories);
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
  /** Dictionary entry key (alias phrase or canonical text). */
  entryText: string;
  canonical: string;
  isAlias: boolean;
}

/** Finds non-overlapping highlight spans in source text (prefers longer phrases). */
export function findHighlightSpans(sourceText: string, tokens: TokenEntry[]): HighlightSpan[] {
  const matchPhrases = getActiveMatchPhrases(tokens);
  if (matchPhrases.length === 0) return [];

  const candidates: HighlightSpan[] = [];
  for (const rule of matchPhrases) {
    const re = buildPhraseHighlightRegex(rule.phrase);
    if (!re) continue;
    let match: RegExpExecArray | null;
    while ((match = re.exec(sourceText)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (!isWholeWordSpan(sourceText, start, end)) continue;
      candidates.push({
        start,
        end,
        entryText: rule.phrase,
        canonical: rule.canonical,
        isAlias: rule.phrase !== rule.canonical,
      });
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
