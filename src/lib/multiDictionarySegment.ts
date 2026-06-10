/**
 * Multi-dictionary segmentation: greedy longest-match with dictionary provenance.
 */
import type { TokenCategory } from './dictionaryTree';
import {
  getCategorySortOrder,
  orderSegmentsByCategories,
  type SegmentMatch,
} from './dictionaryTree';
import type { DictionaryScope, KbDictionary } from './dictionaryLibrary';
import {
  getActiveMatchPhrases,
  normalizeDescriptionText,
  tokenizeToWords,
  type MatchPhrase,
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

function wordsMatch(tokenWords: string[], start: number, phrase: string): boolean {
  const parts = tokenizeToWords(phrase);
  if (parts.length === 0 || start + parts.length > tokenWords.length) return false;
  return parts.every((w, i) => tokenWords[start + i] === w);
}

function segmentWordsMulti(
  words: string[],
  phrases: TaggedPhrase[],
): { matches: TaggedMatch[]; unmatched: string[] } {
  const matches: TaggedMatch[] = [];
  const unmatched: string[] = [];
  let i = 0;

  while (i < words.length) {
    let matched: TaggedPhrase | null = null;
    for (const rule of phrases) {
      if (wordsMatch(words, i, rule.phrase)) {
        matched = rule;
        break;
      }
    }
    if (matched) {
      matches.push({
        text: matched.canonical,
        wordStartIndex: i,
        dictionaryId: matched.dictionaryId,
        priority: matched.priority,
      });
      i += tokenizeToWords(matched.phrase).length;
    } else {
      unmatched.push(words[i]!);
      i += 1;
    }
  }

  return { matches, unmatched };
}

function orderTaggedSegments(matches: TaggedMatch[], loaded: LoadedDictionaryRef[]): SegmentedToken[] {
  if (matches.length === 0) return [];

  const categoriesByDict = new Map(
    loaded.map((l) => [l.dictionary.id, l.dictionary.categories ?? []]),
  );

  const sorted = [...matches].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const catA = getCategorySortOrder(a.text, categoriesByDict.get(a.dictionaryId) ?? []);
    const catB = getCategorySortOrder(b.text, categoriesByDict.get(b.dictionaryId) ?? []);
    if (catA !== catB) return catA - catB;
    return a.wordStartIndex - b.wordStartIndex;
  });

  return sorted.map((m) => ({ text: m.text, dictionaryId: m.dictionaryId }));
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

  return {
    segments,
    path: segments.map((s) => s.text).join('.'),
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
  const matches: SegmentMatch[] = [];
  let i = 0;
  while (i < words.length) {
    let matched: MatchPhrase | null = null;
    for (const rule of phrases) {
      if (wordsMatch(words, i, rule.phrase)) {
        matched = rule;
        break;
      }
    }
    if (matched) {
      matches.push({ text: matched.canonical, wordStartIndex: i });
      i += tokenizeToWords(matched.phrase).length;
    } else {
      i += 1;
    }
  }
  const ordered = orderSegmentsByCategories(matches, categories);
  return ordered.map((text) => ({ text, dictionaryId: '' }));
}

export function dictionaryScopeLabel(scope: DictionaryScope): string {
  return scope === 'library' ? 'Libreria' : 'Progetto';
}
