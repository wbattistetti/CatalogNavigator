/**
 * Lightweight slot extraction for corpus building and legacy testEngine.
 */
import type { BundleCorpusItem, BundleCorpusSegment } from './agentBundleTypes';
import {
  getCategoryIdForToken,
  getCategoryTypeForToken,
  normalizeCategoryOrders,
  type TokenCategory,
} from './dictionaryTree';
import { matchGrammarInput } from './grammarMatch';
import { matchCategoryGrammar } from './categoryGrammar';
import type { TokenEntry } from './tokenDictionary';
import { isCanonicalToken } from './tokenDictionary';
import { AGE_YEARS_QUESTION } from './constraintValidation';

/** Normalizes category name for slot map keys (matches VB CategoryNormalization). */
export function normalizeSlotCategoryKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s*\(vincolo\)\s*/gi, '')
    .replace(/\s+/g, ' ');
}

// ── Slot extraction ─────────────────────────────────────────────────────────

/**
 * Scans category grammars (preferred) or legacy token grammars for matches.
 * Returns `{ categoryKey → canonicalTokenText }` — first category in order wins.
 */
export function matchTextToSlots(
  text: string,
  tokens: TokenEntry[],
  categories: TokenCategory[],
): Record<string, string> {
  const ordered = normalizeCategoryOrders(categories);
  const result: Record<string, string> = {};
  const lower = text.trim().toLowerCase();
  if (!lower) return result;

  for (const category of ordered) {
    if (category.type === 'vincolo') continue;
    const key = normalizeSlotCategoryKey(category.name);
    if (result[key] != null) continue;

    if (category.grammar?.regex?.trim()) {
      const matched = matchCategoryGrammar(lower, category);
      if (matched) {
        result[key] = matched.canonicalValue;
        continue;
      }
    }

    for (const entry of tokens) {
      if (!isCanonicalToken(entry) || !entry.grammar?.regex?.trim()) continue;

      const catId = getCategoryIdForToken(entry.text, ordered);
      if (catId !== category.id) continue;

      const fakeRow = {
        slot_filling: entry.text,
        grammar: entry.grammar,
        answer_grammar: null,
        question: null,
        no_match_1: null,
        no_match_2: null,
        no_match_3: null,
        confirmation_text: null,
        status: null,
      };

      const match = matchGrammarInput(lower, fakeRow);
      if (match.targetPath) {
        result[key] = entry.text;
        break;
      }
    }
  }

  return result;
}

// ── Lightweight corpus ───────────────────────────────────────────────────────

/**
 * Builds BundleCorpusItems from item paths by mapping each path segment to
 * its dictionary category. Segments not found in any category are kept with
 * an empty `categoryName` and are not used for slot scoring.
 */
export function buildCorpusItemsFromPaths(
  itemPaths: string[],
  categories: TokenCategory[],
): BundleCorpusItem[] {
  const ordered = normalizeCategoryOrders(categories);
  return itemPaths.map((path) => {
    const segments: BundleCorpusSegment[] = path.split('.').map((seg) => {
      const catId = getCategoryIdForToken(seg, ordered);
      const category = ordered.find((c) => c.id === catId);
      const categoryType = getCategoryTypeForToken(seg, ordered);
      return {
        text: seg,
        categoryName: category?.name ?? '',
        categoryType,
      };
    });
    return {
      path,
      sourceText: path,
      segments,
      unmatched: [],
      constraints: [],
    };
  });
}

// ── Slot-based candidate scoring ────────────────────────────────────────────

/**
 * Scores every item path by how many attributo category+value slots match.
 * Returns paths tied at the maximum count.
 */
export function scorePathsBySlots(
  itemPaths: string[],
  corpusItems: BundleCorpusItem[],
  resolvedSlots: Record<string, string>,
): { paths: string[]; maxCount: number } {
  const slotKeys = Object.keys(resolvedSlots);
  if (slotKeys.length === 0) return { paths: itemPaths, maxCount: 0 };

  const corpusMap = new Map(corpusItems.map((i) => [i.path, i]));

  const scores = itemPaths.map((path) => {
    const item = corpusMap.get(path);
    if (!item) return { path, count: 0 };

    let count = 0;
    for (const [key, tokenValue] of Object.entries(resolvedSlots)) {
      const hasMatch = item.segments.some(
        (seg) =>
          seg.categoryType === 'attributo'
          && normalizeSlotCategoryKey(seg.categoryName) === key
          && seg.text.toLowerCase() === tokenValue.toLowerCase(),
      );
      if (hasMatch) count += 1;
    }
    return { path, count };
  });

  const maxCount = Math.max(0, ...scores.map((s) => s.count));
  if (maxCount === 0) return { paths: [], maxCount: 0 };

  return {
    paths: scores.filter((s) => s.count === maxCount).map((s) => s.path),
    maxCount,
  };
}

// ── Next-question resolution ─────────────────────────────────────────────────

export interface SlotDisambiguation {
  kind: 'disambiguate';
  categoryName: string;
  categoryKey: string;
  options: string[];
  /** Ready-to-speak question text. */
  questionText: string;
}

export interface SlotAskAge {
  kind: 'ask_age';
  questionText: string;
}

export interface SlotConfirm {
  kind: 'confirm';
  path: string;
}

export interface SlotNoMatch {
  kind: 'no_match';
}

export type SlotNavigationResult =
  | SlotDisambiguation
  | SlotAskAge
  | SlotConfirm
  | SlotNoMatch;

/**
 * Given the current candidate set and resolved slots, decides what to do next:
 * - confirm if only one candidate remains
 * - ask_age if any vincolo is unresolved
 * - disambiguate on the first attributo category (by dict order) with ≥2 values
 * - no_match when no candidates survived
 */
export function resolveNextSlotNavigation(
  candidates: string[],
  corpusItems: BundleCorpusItem[],
  resolvedSlots: Record<string, string>,
  categories: TokenCategory[],
): SlotNavigationResult {
  if (candidates.length === 0) return { kind: 'no_match' };

  if (candidates.length === 1) {
    return { kind: 'confirm', path: candidates[0]! };
  }

  const ordered = normalizeCategoryOrders(categories);
  const corpusMap = new Map(corpusItems.map((i) => [i.path, i]));

  // Check if any vincolo (age constraint) is unresolved across candidates
  const hasUnresolvedVincolo = ordered.some((cat) => {
    if (cat.type !== 'vincolo') return false;
    const key = normalizeSlotCategoryKey(cat.name);
    if (resolvedSlots[key] != null) return false;
    return candidates.some((path) => {
      const item = corpusMap.get(path);
      return item?.segments.some(
        (seg) => normalizeSlotCategoryKey(seg.categoryName) === key,
      ) ?? false;
    });
  });

  if (hasUnresolvedVincolo) {
    return { kind: 'ask_age', questionText: AGE_YEARS_QUESTION };
  }

  // First attributo category with ≥2 distinct values among candidates
  for (const category of ordered) {
    if (category.type === 'vincolo') continue;
    const key = normalizeSlotCategoryKey(category.name);
    if (resolvedSlots[key] != null) continue;

    const values = new Set<string>();
    for (const path of candidates) {
      const item = corpusMap.get(path);
      if (!item) continue;
      const seg = item.segments.find(
        (s) => normalizeSlotCategoryKey(s.categoryName) === key,
      );
      if (seg?.text) values.add(seg.text);
    }

    if (values.size >= 2) {
      const options = [...values].sort((a, b) => a.localeCompare(b, 'it'));
      const listed = options.length === 2
        ? `${options[0]} o ${options[1]}`
        : `${options.slice(0, -1).join(', ')} o ${options[options.length - 1]}`;
      return {
        kind: 'disambiguate',
        categoryName: category.name,
        categoryKey: key,
        options,
        questionText: `Per ${category.name}, preferisce ${listed}?`,
      };
    }
  }

  // All categories have ≤1 value → confirm first candidate (implicit)
  return { kind: 'confirm', path: candidates[0]! };
}
