/**
 * Corpus-driven token dictionary and deterministic longest-match segmentation.
 */
import type { GrammarEntry } from '../hooks/useAnalysis';
import type { TokenCategory } from './dictionaryTree';
import { type SegmentMatch } from './dictionaryTree';
import { segmentDescriptionGrammarAware } from './grammarAwareSegment';
import {
  collectWordSpanMatchesAfterShadow,
  corpusWordMatchesPhraseWord,
  findAllWordSpanMatches,
  collectHighlightSpansAfterShadow,
  wordsMatchAtPhrase,
} from './phraseMatchEngine';
import { dropPreliminaryNegatedMatches, isPreliminaryNegationBeforeMatch } from './preliminaryNegation';

export type { TokenCategory } from './dictionaryTree';

export interface TokenEntry {
  text: string;
  enabled: boolean;
  /** Legacy field; cleared on load. Shadowing is match-time only. */
  suppressedBy?: string;
  /** Surface phrase that maps to another canonical token (synonym). */
  aliasOf?: string;
  /** Recognition grammar shared by all nodes using this token segment. */
  grammar?: GrammarEntry | null;
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

const PUNCTUATION_RE = /[.,;:!?()[\]{}"'\/\\|\-–—^]+/g;

/** Characters treated as line / list markers before token words (> variants, bullets, etc.). */
const LINE_MARKER_RE = /[>•\-–—›»➤➔⯈＞\uFF1E]/u;

/** Prefix symbols stored with the first word (+ecg, not a separate token). */
const ATTACHED_WORD_PREFIX_RE = /\+/u;

/** Line / list markers and attached + prefixes preserved in stored token phrases. */
const PHRASE_MARKER_RE = /[>+•\-–—›»➤➔⯈＞\uFF1E]/u;

function isLineMarkerChar(ch: string): boolean {
  return LINE_MARKER_RE.test(ch);
}

function isInvisibleSeparatorChar(ch: string): boolean {
  return /\s/u.test(ch) || /[\u200B-\u200D\uFEFF]/u.test(ch);
}

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

  const start = resolveTextOffsetInContainer(container, range.startContainer, range.startOffset);
  const end = resolveTextOffsetInContainer(container, range.endContainer, range.endOffset);
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

function sourceOffsetFromMarkedAncestor(
  container: HTMLElement,
  node: Node,
  offset: number,
): number {
  let el: HTMLElement | null = node.nodeType === Node.TEXT_NODE
    ? node.parentElement
    : (node as HTMLElement);
  while (el && container.contains(el)) {
    const startRaw = el.getAttribute('data-source-start');
    const endRaw = el.getAttribute('data-source-end');
    if (startRaw != null && endRaw != null) {
      const start = Number(startRaw);
      const end = Number(endRaw);
      if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
        if (node.nodeType === Node.TEXT_NODE) {
          const local = textOffsetInElement(el, node, offset);
          if (local >= 0) return Math.min(end, start + local);
        }
        return start;
      }
    }
    el = el.parentElement;
  }
  return -1;
}

function resolveTextOffsetInContainer(
  container: HTMLElement,
  node: Node,
  offset: number,
): number {
  const direct = textOffsetInElement(container, node, offset);
  if (direct >= 0) return direct;
  return sourceOffsetFromMarkedAncestor(container, node, offset);
}

/** True when the user has a non-empty text selection inside `container`. */
export function hasTextSelectionInElement(container: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) {
    return false;
  }
  return sel.toString().trim().length > 0;
}

/** Normalizes description text for tokenization. */
export function normalizeDescriptionText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\+\s+(?=[\p{L}\p{N}])/gu, '+')
    .replace(PUNCTUATION_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Expands selection start to include leading markers (> •) or attached + before the word. */
function expandStartWithPhrasePrefix(sourceText: string, start: number): number {
  let i = start;
  while (i > 0 && isInvisibleSeparatorChar(sourceText[i - 1]!)) i--;
  const markerEnd = i;
  while (i > 0 && isLineMarkerChar(sourceText[i - 1]!)) i--;
  if (i < markerEnd) return i;

  if (i > 0 && ATTACHED_WORD_PREFIX_RE.test(sourceText[i - 1]!) && isWordChar(sourceText[i]!)) {
    if (i === 1 || !isWordChar(sourceText[i - 2]!)) return i - 1;
  }
  return start;
}

/** Normalizes a user text selection into a dictionary token phrase. */
export function selectionToTokenPhrase(
  selectedText: string,
  range?: SelectionRange | null,
): string | null {
  if (range) {
    const trimmed = trimSelectionRange(range.sourceText, range.start, range.end);
    if (trimmed.start >= trimmed.end) return null;
    const start = expandStartWithPhrasePrefix(trimmed.sourceText, trimmed.start);
    const slice = trimmed.sourceText.slice(start, trimmed.end);
    const phrase = normalizeDescriptionText(slice);
    return phrase || null;
  }
  const phrase = normalizeDescriptionText(selectedText);
  return phrase || null;
}

/** Splits normalized text into whole words (+ecg counts as one word). */
export function tokenizeToWords(text: string): string[] {
  return text.match(/\+[\p{L}\p{N}]+|[\p{L}\p{N}]+/gu) ?? [];
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

/** True when subPhrase is a strict contiguous word sub-sequence of containerPhrase. */
export function isContiguousWordSubphrase(containerPhrase: string, subPhrase: string): boolean {
  const container = normalizeDescriptionText(containerPhrase);
  const sub = normalizeDescriptionText(subPhrase);
  if (!container || !sub || container === sub) return false;
  const containerWords = tokenizeToWords(container);
  const subWords = tokenizeToWords(sub);
  if (subWords.length === 0 || subWords.length >= containerWords.length) return false;
  for (let i = 0; i <= containerWords.length - subWords.length; i++) {
    if (subWords.every((w, j) => containerWords[i + j] === w)) return true;
  }
  return false;
}

/** Canonical tokens strictly longer than phrase that contain it as a word subphrase. */
export function findLongerTokensContainingPhrase(phrase: string, tokens: TokenEntry[]): string[] {
  const normalized = normalizeDescriptionText(phrase);
  if (!normalized) return [];
  return tokens
    .filter((t) => isCanonicalToken(t) && t.text !== normalized)
    .filter((t) => isContiguousWordSubphrase(t.text, normalized))
    .sort((a, b) => wordCount(a.text) - wordCount(b.text) || a.text.length - b.text.length)
    .map((t) => t.text);
}

/**
 * Suggests a longer dictionary token when the selection is part of that token
 * and the full longer phrase appears in the same corpus row at the selection.
 */
export function suggestLongerTokenInSource(
  phrase: string,
  sourceText: string,
  range: SelectionRange | null,
  tokens: TokenEntry[],
): string | null {
  const candidates = findLongerTokensContainingPhrase(phrase, tokens);
  if (candidates.length === 0) return null;
  if (!range) return candidates[0] ?? null;

  const words = tokenizeToWordsWithOffsets(sourceText);
  for (const candidate of candidates) {
    const parts = tokenizeToWords(candidate);
    for (let i = 0; i <= words.length - parts.length; i++) {
      if (!parts.every((w, j) => words[i + j]!.word === w)) continue;
      const spanStart = words[i]!.start;
      const spanEnd = words[i + parts.length - 1]!.end;
      if (range.start >= spanStart && range.start < spanEnd) return candidate;
    }
  }
  return null;
}

/** Ensures all dictionary entries are active; containment shadowing is match-time only. */
export function normalizeTokenEntries(tokens: TokenEntry[]): TokenEntry[] {
  return tokens.map((t) => ({
    ...t,
    enabled: true,
    suppressedBy: undefined,
  }));
}

/** @deprecated Prefer normalizeTokenEntries */
export const applySuppressionCascade = normalizeTokenEntries;

function sortByPhraseLengthDesc(a: { text: string }, b: { text: string }): number {
  const wa = wordCount(a.text);
  const wb = wordCount(b.text);
  if (wb !== wa) return wb - wa;
  return b.text.length - a.text.length;
}

/** True when the entry is a canonical token (not an alias surface phrase). */
export function isCanonicalToken(entry: TokenEntry): boolean {
  return !entry.aliasOf;
}

/** All canonical token phrases, longest first. */
export function getActiveTokens(tokens: TokenEntry[]): string[] {
  return tokens
    .filter(isCanonicalToken)
    .sort(sortByPhraseLengthDesc)
    .map((t) => t.text);
}

/** All match phrases (canonical + aliases); enabled flag does not exclude corpus matching. */
export function getActiveMatchPhrases(tokens: TokenEntry[]): MatchPhrase[] {
  const canonicalTexts = new Set(
    tokens.filter((t) => isCanonicalToken(t)).map((t) => t.text),
  );
  const phrases: MatchPhrase[] = [];

  for (const t of tokens) {
    if (t.aliasOf) {
      if (!canonicalTexts.has(t.aliasOf)) continue;
      phrases.push({ phrase: t.text, canonical: t.aliasOf });
      continue;
    }
    if (isCanonicalToken(t)) {
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

/** Adds a token from manual selection; dedupes and normalizes entries. */
export function addToken(
  tokens: TokenEntry[],
  rawPhrase: string,
  range?: SelectionRange | null,
): TokenEntry[] {
  const text = selectionToTokenPhrase(rawPhrase, range);
  if (!text) throw new Error('Selezione vuota o non valida');
  if (tokens.some((t) => t.text === text && isCanonicalToken(t))) {
    return normalizeTokenEntries(tokens);
  }
  const without = tokens.filter((t) => t.text !== text);
  return normalizeTokenEntries([...without, { text, enabled: true }]);
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
  return normalizeTokenEntries(filtered);
}

/** Matches a dictionary token only against consecutive whole words (exact equality per word). */
export function wordsMatch(tokenWords: string[], start: number, phrase: string): boolean {
  return wordsMatchAtPhrase(tokenWords, start, phrase);
}

/** Segments words: all matches after containment shadow; partial overlaps are kept. */
export function segmentWordsWithPositions(words: string[], matchPhrases: MatchPhrase[]): {
  matches: SegmentMatch[];
  unmatched: string[];
} {
  const candidates = findAllWordSpanMatches(words, matchPhrases);
  const selected = dropPreliminaryNegatedMatches(
    words,
    collectWordSpanMatchesAfterShadow(candidates),
  );

  const matchedWordIndices = new Set<number>();
  for (const m of selected) {
    for (let w = m.wordStart; w < m.wordEnd; w++) matchedWordIndices.add(w);
  }

  const unmatched = words.filter((_, i) => !matchedWordIndices.has(i));
  const matches: SegmentMatch[] = selected.map((m) => ({
    text: m.canonical,
    wordStartIndex: m.wordStart,
  }));

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
  prebuiltMatchPhrases?: MatchPhrase[],
): SegmentationResult {
  return segmentDescriptionGrammarAware(text, tokens, categories, prebuiltMatchPhrases);
}

/** Matched dictionary tokens in category order (multiple per category allowed). */
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
    const grammarRaw = item.grammar as { regex?: string; mappings?: Record<string, string> } | null | undefined;
    const grammar = grammarRaw?.regex?.trim()
      ? { regex: grammarRaw.regex, mappings: grammarRaw.mappings ?? {} }
      : null;

    migrated.push({
      text,
      enabled: true,
      aliasOf: item.aliasOf ? normalizeDescriptionText(item.aliasOf) : undefined,
      grammar: grammar ?? undefined,
    });
  }

  return normalizeTokenEntries(migrated);
}

/** All dictionary tokens sorted alphabetically. */
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
  const matchPhrases = getActiveMatchPhrases(tokens);

  descriptions.forEach((sourceText, rowIndex) => {
    const trimmed = sourceText.trim();
    if (!trimmed) return;
    const result = segmentDescription(trimmed, tokens, categories, matchPhrases);
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

/** Separators between words when matching a multi-word phrase (mirrors tokenizeToWords splits). */
const PHRASE_WORD_GAP = '[^\\p{L}\\p{N}]+';

/** Splits a stored phrase into optional symbol prefix, words, and suffix for corpus matching. */
export function splitPhraseForMatch(phrase: string): {
  prefix: string;
  words: string[];
  suffix: string;
} {
  const trimmed = phrase.trim();
  let start = 0;
  let end = trimmed.length;
  while (start < end && !/[\p{L}\p{N}]/u.test(trimmed[start]!)) start++;
  while (end > start && !/[\p{L}\p{N}]/u.test(trimmed[end - 1]!)) end--;
  const rawPrefix = trimmed.slice(0, start);
  const prefix = [...rawPrefix].filter((ch) => PHRASE_MARKER_RE.test(ch)).join('');
  return {
    prefix,
    words: tokenizeToWords(trimmed.slice(start, end)),
    suffix: trimmed.slice(end),
  };
}

/** True when [start, end) is a valid highlight span (whole words; leading markers allowed). */
export function isValidHighlightSpan(text: string, start: number, end: number): boolean {
  if (start < 0 || end > text.length || start >= end) return false;
  if (start > 0 && isWordChar(text[start - 1]!)) return false;
  if (end < text.length && isWordChar(text[end]!)) return false;

  let wordStart = start;
  while (wordStart < end && !isWordChar(text[wordStart]!)) wordStart++;
  let wordEnd = end;
  while (wordEnd > wordStart && !isWordChar(text[wordEnd - 1]!)) wordEnd--;

  if (wordStart >= wordEnd) return true;
  if (wordStart > 0 && isWordChar(text[wordStart - 1]!)) return false;
  if (wordEnd < text.length && isWordChar(text[wordEnd]!)) return false;
  return true;
}

/** Case-insensitive regex matching a phrase on whole words only (no sub-word matches). */
export function buildPhraseHighlightRegex(phrase: string): RegExp | null {
  const { prefix, words, suffix } = splitPhraseForMatch(phrase);
  if (words.length === 0 && !prefix && !suffix) return null;

  const wordBoundaryStart = '(?<![\\p{L}\\p{N}])';
  const wordBoundaryEnd = '(?![\\p{L}\\p{N}])';
  let pattern = wordBoundaryStart;

  if (prefix) {
    pattern += [...prefix].map(escapeRegexChar).join('');
    if (words.length > 0) {
      pattern += prefix.includes('+') ? `(?:${PHRASE_WORD_GAP})?` : PHRASE_WORD_GAP;
    }
  }

  if (words.length > 0) {
    pattern += words.map((p) => escapeRegexChar(p)).join(PHRASE_WORD_GAP);
  }

  if (suffix) {
    if (words.length > 0 || prefix) pattern += `${PHRASE_WORD_GAP}?`;
    pattern += [...suffix].map(escapeRegexChar).join('');
  }

  pattern += wordBoundaryEnd;
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

/** Word in source text with character offsets (word text is lowercased for matching). */
export interface SourceWordSpan {
  word: string;
  start: number;
  end: number;
}

/** Extracts whole words from source text preserving character offsets. */
export function tokenizeToWordsWithOffsets(text: string): SourceWordSpan[] {
  const out: SourceWordSpan[] = [];
  const re = /\+[\p{L}\p{N}]+|[\p{L}\p{N}]+/gu;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    out.push({
      word: match[0].toLowerCase(),
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return out;
}

/** Character span for a phrase matched at a word index (includes leading line markers when stored). */
function charSpanForWordMatch(
  sourceText: string,
  words: SourceWordSpan[],
  wordStartIndex: number,
  phrase: string,
): { start: number; end: number } | null {
  const parts = tokenizeToWords(phrase);
  if (parts.length === 0 || wordStartIndex + parts.length > words.length) return null;
  if (!parts.every((w, i) => corpusWordMatchesPhraseWord(words[wordStartIndex + i]!.word, w, i))) {
    return null;
  }

  let start = words[wordStartIndex]!.start;
  const end = words[wordStartIndex + parts.length - 1]!.end;

  // Include a leading > / • / - in the chip when present in the source text.
  start = expandStartWithPhrasePrefix(sourceText, start);

  return { start, end };
}

/** Finds highlight spans using pre-built match phrases (same engine as multi-dict segmentation). */
export function findHighlightSpansFromPhrases(
  sourceText: string,
  matchPhrases: MatchPhrase[],
): HighlightSpan[] {
  if (matchPhrases.length === 0) return [];

  const wordSpans = tokenizeToWordsWithOffsets(sourceText);
  if (wordSpans.length === 0) return [];

  // Lowercase words for phrase matching; offsets stay on original source text.
  const wordTexts = wordSpans.map((w) => w.word);
  const shadowed = collectWordSpanMatchesAfterShadow(
    findAllWordSpanMatches(wordTexts, matchPhrases),
  );
  const allowed = dropPreliminaryNegatedMatches(wordTexts, shadowed);
  const allowedKeys = new Set(allowed.map((m) => `${m.wordStart}:${m.phrase}`));

  const candidates: HighlightSpan[] = [];
  const seen = new Set<string>();

  const pushCandidate = (
    start: number,
    end: number,
    rule: MatchPhrase,
    wordStart: number,
  ) => {
    if (isPreliminaryNegationBeforeMatch(wordTexts, wordStart, shadowed)
        && !allowedKeys.has(`${wordStart}:${rule.phrase}`)) {
      return;
    }
    const key = `${start}:${end}:${rule.phrase}`;
    if (seen.has(key)) return;
    if (!isValidHighlightSpan(sourceText, start, end)) return;
    seen.add(key);
    candidates.push({
      start,
      end,
      entryText: rule.phrase,
      canonical: rule.canonical,
      isAlias: rule.phrase !== rule.canonical,
    });
  };

  for (const m of allowed) {
    const span = charSpanForWordMatch(sourceText, wordSpans, m.wordStart, m.phrase);
    if (!span) continue;
    pushCandidate(span.start, span.end, m, m.wordStart);
  }

  for (const rule of matchPhrases) {
    const partCount = tokenizeToWords(rule.phrase).length;
    if (partCount === 0) continue;
    const re = buildPhraseHighlightRegex(rule.phrase);
    if (!re) continue;
    let match: RegExpExecArray | null;
    while ((match = re.exec(sourceText)) !== null) {
      const wordStart = wordSpans.findIndex((w) => w.start === match!.index);
      if (wordStart < 0) continue;
      if (allowedKeys.has(`${wordStart}:${rule.phrase}`)) continue;
      pushCandidate(match.index, match.index + match[0].length, rule, wordStart);
    }
  }

  return collectHighlightSpansAfterShadow(candidates);
}

/** Finds highlight spans in source text (contained shorter phrases are shadowed). */
export function findHighlightSpans(sourceText: string, tokens: TokenEntry[]): HighlightSpan[] {
  return findHighlightSpansFromPhrases(sourceText, getActiveMatchPhrases(tokens));
}
