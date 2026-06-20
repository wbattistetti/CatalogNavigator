/**
 * Per-row segmentation edits: exclude path segments or whole items without touching the dictionary.
 */
import type { CorpusSegmentationEntry } from './corpusSegmentationCache';
import { parseSegmentExclusionKey } from './corpusExclusionKeys';
import { tokenizeToWords, type RowSegmentation } from './tokenDictionary';

/** Manual segment removals keyed by trimmed corpus description text. */
export type CorpusSegmentExclusions = ReadonlyMap<string, ReadonlySet<string>>;

/** Whole corpus rows excluded from catalog compile (trimmed source description). */
export type CorpusItemExclusions = ReadonlySet<string>;

function partitionExclusionKeys(excludedSegments: ReadonlySet<string>): {
  removeAllTexts: Set<string>;
  removeOccurrence1Based: Map<string, Set<number>>;
} {
  const removeAllTexts = new Set<string>();
  const removeOccurrence1Based = new Map<string, Set<number>>();

  for (const key of excludedSegments) {
    const parsed = parseSegmentExclusionKey(key);
    if (parsed.occurrence1Based != null) {
      const set = removeOccurrence1Based.get(parsed.text) ?? new Set<number>();
      set.add(parsed.occurrence1Based);
      removeOccurrence1Based.set(parsed.text, set);
      continue;
    }
    removeAllTexts.add(parsed.text);
  }

  return { removeAllTexts, removeOccurrence1Based };
}

function shouldRemoveSegment(
  segmentText: string,
  occurrence1Based: number,
  removeAllTexts: Set<string>,
  removeOccurrence1Based: Map<string, Set<number>>,
): boolean {
  if (removeAllTexts.has(segmentText)) return true;
  return removeOccurrence1Based.get(segmentText)?.has(occurrence1Based) ?? false;
}

/** Applies manual segment exclusions on top of a cached segmentation row. */
export function applySegmentExclusions(
  entry: CorpusSegmentationEntry,
  excludedSegments: ReadonlySet<string>,
): CorpusSegmentationEntry {
  if (excludedSegments.size === 0) return entry;

  const { removeAllTexts, removeOccurrence1Based } = partitionExclusionKeys(excludedSegments);

  const removedSegments: typeof entry.segments = [];
  const segments: typeof entry.segments = [];

  entry.segments.forEach((seg, index) => {
    const occurrence1Based = index + 1;
    if (shouldRemoveSegment(seg.text, occurrence1Based, removeAllTexts, removeOccurrence1Based)) {
      removedSegments.push(seg);
      return;
    }
    segments.push(seg);
  });

  if (removedSegments.length === 0) return entry;

  const path = segments.map((seg) => seg.text).join('.');

  const unmatchedSet = new Set(entry.unmatched);
  for (const seg of removedSegments) {
    for (const word of tokenizeToWords(seg.text)) {
      unmatchedSet.add(word);
    }
  }

  return {
    segments,
    path,
    unmatched: [...unmatchedSet],
  };
}

/** Returns a new exclusion set with one more segment key (all occurrences of text). */
export function addSegmentExclusion(
  excludedSegments: ReadonlySet<string>,
  segmentText: string,
): Set<string> {
  const next = new Set(excludedSegments);
  next.add(segmentText.trim());
  return next;
}

/** Returns a new exclusion set excluding one segment occurrence (1-based index). */
export function addSegmentOccurrenceExclusion(
  excludedSegments: ReadonlySet<string>,
  segmentText: string,
  occurrenceIndex1Based: number,
): Set<string> {
  const next = new Set(excludedSegments);
  next.add(`${segmentText.trim()}@${occurrenceIndex1Based}`);
  return next;
}

export function addCorpusItemExclusion(
  excludedItems: ReadonlySet<string>,
  sourceText: string,
): Set<string> {
  const key = sourceText.trim();
  if (!key) return new Set(excludedItems);
  const next = new Set(excludedItems);
  next.add(key);
  return next;
}

export function removeCorpusItemExclusion(
  excludedItems: ReadonlySet<string>,
  sourceText: string,
): Set<string> {
  const key = sourceText.trim();
  const next = new Set(excludedItems);
  next.delete(key);
  return next;
}

function rowToSegmentationEntry(row: RowSegmentation): CorpusSegmentationEntry {
  const segments = row.path.split('.').filter(Boolean).map((text) => ({
    text,
    dictionaryId: '',
  }));
  return {
    segments,
    path: row.path,
    unmatched: row.unmatched ?? [],
  };
}

/** Applies manual exclusions to one segmented corpus row. */
export function applyExclusionsToRow(
  row: RowSegmentation,
  excludedSegments: ReadonlySet<string>,
): RowSegmentation {
  if (excludedSegments.size === 0) return row;
  const entry = applySegmentExclusions(rowToSegmentationEntry(row), excludedSegments);
  return {
    ...row,
    path: entry.path,
    unmatched: entry.unmatched,
  };
}

/** Drops whole rows excluded from catalog compile. */
export function applyItemExclusionsToRows(
  rows: RowSegmentation[],
  itemExclusions: CorpusItemExclusions | undefined,
): RowSegmentation[] {
  if (!itemExclusions?.size) return rows;
  return rows.filter((row) => !itemExclusions.has(row.sourceText.trim()));
}

/** Applies item + segment exclusions to all segmented rows. */
export function applyExclusionsToRows(
  rows: RowSegmentation[],
  exclusions: CorpusSegmentExclusions | undefined,
  itemExclusions?: CorpusItemExclusions,
): RowSegmentation[] {
  const visibleRows = applyItemExclusionsToRows(rows, itemExclusions);
  if (!exclusions || exclusions.size === 0) return visibleRows;
  return visibleRows.map((row) => {
    const excluded = exclusions.get(row.sourceText.trim());
    if (!excluded?.size) return row;
    return applyExclusionsToRow(row, excluded);
  });
}
