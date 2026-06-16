/**
 * Multi-dictionary segmentation: all matches after containment shadow (partial overlaps kept).
 */
import type { TokenCategory } from './dictionaryTree';
import {
  getCategorySortOrder,
  orderSegmentsByCategories,
  type SegmentMatch,
} from './dictionaryTree';
import type { DictionaryScope, KbDictionary } from './dictionaryLibrary';
import {
  canonicalizePathSegmentsFromLoadedRefs,
  getPathOrderingCategories,
  getPrimaryLoadedDictionaryRef,
} from './pathCanonicalize';
import { collectWordSpanMatchesAfterShadow, type WordSpanMatch } from './phraseMatchEngine';
import {
  applySuppressionCascade,
  getActiveMatchPhrases,
  normalizeDescriptionText,
  segmentWordsWithPositions,
  tokenizeToWords,
  type MatchPhrase,
  type RowSegmentation,
  type TokenEntry,
} from './tokenDictionary';

export interface LoadedDictionaryRef {
  dictionary: KbDictionary;
  /** Lower = higher priority when phrases collide. */
  priority: number;
}

export interface SegmentedToken {
  text: string;
  dictionaryId: string;
}

export interface MultiSegmentationResult {
  segments: SegmentedToken[];
  path: string;
  unmatched: string[];
}

interface TaggedMatch extends SegmentMatch {
  dictionaryId: string;
  priority: number;
}

interface TaggedPhrase extends MatchPhrase {
  dictionaryId: string;
  priority: number;
  categories: TokenCategory[];
}

type ScoredTaggedSpan = WordSpanMatch & {
  score: number;
  dictionaryId: string;
  priority: number;
};

function wordsMatch(tokenWords: string[], start: number, phrase: string): boolean {
  const parts = tokenizeToWords(phrase);
  if (parts.length === 0 || start + parts.length > tokenWords.length) return false;
  return parts.every((w, i) => tokenWords[start + i] === w);
}

function segmentWordsMulti(
  words: string[],
  phrases: TaggedPhrase[],
): { matches: TaggedMatch[]; unmatched: string[] } {
  const candidates: ScoredTaggedSpan[] = [];
  for (const rule of phrases) {
    const partCount = tokenizeToWords(rule.phrase).length;
    if (partCount === 0) continue;
    for (let i = 0; i <= words.length - partCount; i++) {
      if (!wordsMatch(words, i, rule.phrase)) continue;
      candidates.push({
        wordStart: i,
        wordEnd: i + partCount,
        phrase: rule.phrase,
        canonical: rule.canonical,
        isAlias: rule.phrase !== rule.canonical,
        dictionaryId: rule.dictionaryId,
        priority: rule.priority,
        score: rule.priority * 1_000_000 + partCount * 1000 + rule.phrase.length,
      });
    }
  }

  const selected = collectWordSpanMatchesAfterShadow(candidates);
  const matchedWordIndices = new Set<number>();
  for (const m of selected) {
    for (let w = m.wordStart; w < m.wordEnd; w++) matchedWordIndices.add(w);
  }

  const matches: TaggedMatch[] = selected.map((m) => ({
    text: m.canonical,
    wordStartIndex: m.wordStart,
    dictionaryId: m.dictionaryId,
    priority: m.priority,
  }));
  const unmatched = words.filter((_, i) => !matchedWordIndices.has(i));
  return { matches, unmatched };
}

/**
 * Orders matched tokens for path building using merged loaded-dictionary categories.
 * Dictionary priority affects phrase collision resolution only, not path segment order.
 */
function orderTaggedSegments(matches: TaggedMatch[], loaded: LoadedDictionaryRef[]): SegmentedToken[] {
  if (matches.length === 0) return [];

  const categories = getPathOrderingCategories(loaded);
  // Same canonical may match in project + library phrases — keep highest-priority dict match.
  const uniqueByText = new Map<string, TaggedMatch>();
  for (const match of [...matches].sort((a, b) => a.priority - b.priority)) {
    if (!uniqueByText.has(match.text)) uniqueByText.set(match.text, match);
  }
  const deduped = [...uniqueByText.values()];

  const orderedTexts = orderSegmentsByCategories(
    deduped.map((m) => ({ text: m.text, wordStartIndex: m.wordStartIndex })),
    categories,
  );
  const byText = new Map(deduped.map((m) => [m.text, m]));

  const primaryId = getPrimaryLoadedDictionaryRef(loaded)?.dictionary.id ?? '';

  return orderedTexts.map((text) => {
    const match = byText.get(text);
    return {
      text,
      dictionaryId: match?.dictionaryId ?? primaryId,
    };
  });
}

/** Builds tagged match phrases from loaded dictionaries (project dicts first). */
export function buildTaggedMatchPhrases(loaded: LoadedDictionaryRef[]): TaggedPhrase[] {
  const sorted = [...loaded].sort((a, b) => a.priority - b.priority);
  const out: TaggedPhrase[] = [];

  for (const ref of sorted) {
    const phrases = getActiveMatchPhrases(ref.dictionary.tokens);
    for (const p of phrases) {
      out.push({
        ...p,
        dictionaryId: ref.dictionary.id,
        priority: ref.priority,
        categories: ref.dictionary.categories ?? [],
      });
    }
  }

  return out.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.phrase.length - a.phrase.length;
  });
}

/** Segments text using all loaded dictionaries; each segment carries dictionary provenance. */
export function segmentDescriptionMulti(
  text: string,
  loaded: LoadedDictionaryRef[],
): MultiSegmentationResult {
  const normalized = normalizeDescriptionText(text);
  if (!normalized || loaded.length === 0) {
    return { segments: [], path: '', unmatched: normalized ? tokenizeToWords(normalized) : [] };
  }

  const phrases = buildTaggedMatchPhrases(loaded);
  if (phrases.length === 0) {
    return { segments: [], path: '', unmatched: tokenizeToWords(normalized) };
  }

  const words = tokenizeToWords(normalized);
  const { matches, unmatched } = segmentWordsMulti(words, phrases);
  const segments = orderTaggedSegments(matches, loaded);
  const path = canonicalizePathSegmentsFromLoadedRefs(
    segments.map((s) => s.text).join('.'),
    loaded,
  );

  return {
    segments: path
      ? path.split('.').map((text) => {
        const found = segments.find((s) => s.text === text);
        return found ?? { text, dictionaryId: loaded[0]?.dictionary.id ?? '' };
      })
      : segments,
    path,
    unmatched: [...new Set(unmatched)],
  };
}

/** Merges tokens from loaded dictionaries; project-scoped entries win on text collision. */
export function mergeLoadedTokens(loaded: LoadedDictionaryRef[]): TokenEntry[] {
  const sorted = [...loaded].sort((a, b) => a.priority - b.priority);
  const byText = new Map<string, TokenEntry>();
  for (const ref of sorted) {
    for (const t of ref.dictionary.tokens) {
      byText.set(t.text, t);
    }
  }
  return [...byText.values()];
}

export interface DictionaryLiveSession {
  tokens: TokenEntry[];
  categories: TokenCategory[];
}

/**
 * Overlays unsaved edit-session tokens onto loaded refs so corpus chips match the live editor.
 */
export function mergeAllDictionarySessionsIntoLoadedRefs(
  loadedRefs: LoadedDictionaryRef[],
  getSession: (dictionaryId: string) => Pick<DictionaryLiveSession, 'tokens' | 'categories'> | null | undefined,
): LoadedDictionaryRef[] {
  if (loadedRefs.length === 0) return loadedRefs;
  return loadedRefs.map((ref) => {
    const session = getSession(ref.dictionary.id);
    if (!session) return ref;
    return {
      ...ref,
      dictionary: {
        ...ref.dictionary,
        tokens: applySuppressionCascade(session.tokens),
        categories: session.categories,
      },
    };
  });
}

/**
 * Overlays one edit session onto loaded refs (legacy helper — prefer mergeAllDictionarySessionsIntoLoadedRefs).
 */
export function mergeLiveEditingIntoLoadedRefs(
  loadedRefs: LoadedDictionaryRef[],
  editingDictionaryId: string | null | undefined,
  editingTokens: TokenEntry[],
  editingCategories: TokenCategory[],
): LoadedDictionaryRef[] {
  if (!editingDictionaryId) return loadedRefs;

  let next = mergeAllDictionarySessionsIntoLoadedRefs(
    loadedRefs,
    (id) => (id === editingDictionaryId
      ? { tokens: editingTokens, categories: editingCategories }
      : null),
  );

  const liveTokens = applySuppressionCascade(editingTokens);
  const found = next.some((ref) => ref.dictionary.id === editingDictionaryId);
  if (!found && liveTokens.length > 0) {
    const meta = loadedRefs[0]?.dictionary;
    next.push({
      priority: 0,
      dictionary: {
        id: editingDictionaryId,
        name: meta?.name ?? 'Project',
        industry: meta?.industry ?? 'general',
        industry_custom: meta?.industry_custom ?? null,
        description: meta?.description ?? null,
        scope: 'project',
        project_id: meta?.project_id ?? null,
        icon_key: meta?.icon_key ?? 'folder',
        icon_color: meta?.icon_color ?? '#34d399',
        categories: editingCategories,
        tokens: liveTokens,
        created_at: meta?.created_at ?? new Date().toISOString(),
        updated_at: meta?.updated_at ?? new Date().toISOString(),
      },
    });
  }

  return next;
}

/** Active tokens for corpus description chips (live edits + saved loaded dicts). */
export function corpusHighlightTokens(
  loadedRefs: LoadedDictionaryRef[],
  editingDictionaryId: string | null | undefined,
  editingTokens: TokenEntry[],
  editingCategories: TokenCategory[],
): TokenEntry[] {
  return mergeLoadedTokens(
    mergeLiveEditingIntoLoadedRefs(loadedRefs, editingDictionaryId, editingTokens, editingCategories),
  );
}

/** Merges categories from loaded dictionaries (kept separate per dict in editor; flat for legacy helpers). */
export function mergeLoadedCategories(loaded: LoadedDictionaryRef[]): TokenCategory[] {
  const out: TokenCategory[] = [];
  for (const ref of loaded) {
    for (const cat of ref.dictionary.categories ?? []) {
      out.push({
        ...cat,
        id: `${ref.dictionary.id}:${cat.id}`,
        name: cat.name,
      });
    }
  }
  return out;
}

/** Lookup dictionary id for a canonical token text (first loaded match). */
export function findDictionaryForToken(
  tokenText: string,
  loaded: LoadedDictionaryRef[],
): string | null {
  const sorted = [...loaded].sort((a, b) => a.priority - b.priority);
  for (const ref of sorted) {
    if (ref.dictionary.tokens.some((t) => t.text === tokenText && !t.aliasOf)) {
      return ref.dictionary.id;
    }
  }
  return null;
}

/** Priority: project custom (0..n), then linked library (100+sort_order). */
export function buildLoadedRefs(
  projectDicts: KbDictionary[],
  linkedLibraryDicts: Array<{ dictionary: KbDictionary; sortOrder: number }>,
): LoadedDictionaryRef[] {
  const refs: LoadedDictionaryRef[] = [];
  projectDicts.forEach((dictionary, index) => {
    refs.push({ dictionary, priority: index });
  });
  linkedLibraryDicts.forEach(({ dictionary, sortOrder }) => {
    refs.push({ dictionary, priority: 100 + sortOrder });
  });
  return refs;
}

/** Single-dictionary fallback compatible with orderSegmentsByCategories. */
export function segmentDescriptionSingleDict(
  text: string,
  tokens: TokenEntry[],
  categories: TokenCategory[],
): SegmentedToken[] {
  const normalized = normalizeDescriptionText(text);
  if (!normalized) return [];
  const phrases = getActiveMatchPhrases(tokens);
  const words = tokenizeToWords(normalized);
  const { matches } = segmentWordsWithPositions(words, phrases);
  const ordered = orderSegmentsByCategories(matches, categories);
  return ordered.map((text) => ({ text, dictionaryId: '' }));
}

export function dictionaryScopeLabel(scope: DictionaryScope): string {
  return scope === 'library' ? 'Libreria' : 'Progetto';
}

/** Segments all corpus rows using loaded dictionaries (respects per-dict category order). */
export function segmentAllDescriptionsFromLoadedRefs(
  descriptions: string[],
  loadedRefs: LoadedDictionaryRef[],
): { leafPaths: string[]; rows: RowSegmentation[] } {
  const rows: RowSegmentation[] = [];
  const leafPaths: string[] = [];

  descriptions.forEach((sourceText, rowIndex) => {
    const trimmed = sourceText.trim();
    if (!trimmed) return;
    const result = segmentDescriptionMulti(trimmed, loadedRefs);
    if (!result.path) return;
    leafPaths.push(result.path);
    rows.push({
      rowIndex,
      sourceText: trimmed,
      path: result.path,
      unmatched: result.unmatched,
    });
  });

  return { leafPaths, rows };
}
