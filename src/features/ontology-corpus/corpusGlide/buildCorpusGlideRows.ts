/**
 * Precalculates corpus Glide row models (description runs + segmentation paints).
 */
import type { CorpusSegmentationEntry } from '../../../lib/corpusSegmentationCache';
import { chipSurfaceStyleFromColor, resolveChipAppearance } from '../../../lib/categoryIconCatalog';
import type { GlideChipPaint } from '../../../lib/glideChipRenderer';
import type { GlideDescRun } from '../../../lib/glideDescriptionRenderer';
import type { LoadedDictionaryRef } from '../../../lib/multiDictionarySegment';
import type { TokenCategory } from '../../../lib/dictionaryTree';
import { findHighlightSpansFromPhrases, type MatchPhrase } from '../../../lib/tokenDictionary';
import { mergeExtraIntoSegmentation } from '../../../lib/corpusExtraAnnotations';
import type { CorpusRow } from '../corpusRowModel';

export interface CorpusGlideRow {
  rowIndex: number;
  text: string;
  descriptionRuns: GlideDescRun[];
  segPaints: GlideChipPaint[];
  extraPaints: GlideChipPaint[];
  segmentation: CorpusSegmentationEntry;
}

function paintForSegment(
  text: string,
  loadedRefs: LoadedDictionaryRef[],
  editingDictionaryId: string | null,
  categories: TokenCategory[],
): GlideChipPaint {
  const appearance = resolveChipAppearance(text, loadedRefs, editingDictionaryId, categories);
  const surface = chipSurfaceStyleFromColor(appearance.categoryColor);
  return {
    text,
    bgColor: surface.backgroundColor,
    borderColor: surface.borderColor,
    fgColor: surface.color,
  };
}

function paintsForSegmentation(
  entry: CorpusSegmentationEntry,
  loadedRefs: LoadedDictionaryRef[],
  editingDictionaryId: string | null,
  categories: TokenCategory[],
): GlideChipPaint[] {
  return entry.segments.map((seg) =>
    paintForSegment(seg.text, loadedRefs, editingDictionaryId, categories),
  );
}

function buildDescriptionRuns(
  text: string,
  matchPhrases: MatchPhrase[],
  loadedRefs: LoadedDictionaryRef[],
  editingDictionaryId: string | null,
  categories: TokenCategory[],
): GlideDescRun[] {
  const spans = findHighlightSpansFromPhrases(text, matchPhrases);
  if (spans.length === 0) {
    return text.length > 0 ? [{ kind: 'text', text }] : [];
  }

  const runs: GlideDescRun[] = [];
  let cursor = 0;

  spans.forEach((span) => {
    if (span.start > cursor) {
      runs.push({ kind: 'text', text: text.slice(cursor, span.start) });
    }
    const label = text.slice(span.start, span.end);
    const paint = paintForSegment(span.canonical, loadedRefs, editingDictionaryId, categories);
    runs.push({
      kind: 'chip',
      text: label,
      paint: { ...paint, text: label },
    });
    cursor = span.end;
  });

  if (cursor < text.length) {
    runs.push({ kind: 'text', text: text.slice(cursor) });
  }

  return runs;
}

const EMPTY_SEGMENTATION: CorpusSegmentationEntry = { segments: [], unmatched: [], path: '' };

/** Benchmark-style palette — instant preview chips without dictionary segmentation. */
const PREVIEW_CHIP_COLORS = ['#f59e0b', '#38bdf8', '#34d399', '#a78bfa', '#f472b6'] as const;
const MAX_PREVIEW_CHIPS = 8;
function previewPaint(text: string, colorHex: string): GlideChipPaint {
  const surface = chipSurfaceStyleFromColor(colorHex);
  return {
    text,
    bgColor: surface.backgroundColor,
    borderColor: surface.borderColor,
    fgColor: surface.color,
  };
}
function buildDescriptionRunsFromSegmentation(
  text: string,
  segmentation: CorpusSegmentationEntry,
  paintForSegment: (canonical: string) => GlideChipPaint,
): GlideDescRun[] {
  if (segmentation.segments.length === 0) {
    return text.length > 0 ? [{ kind: 'text', text }] : [];
  }

  const runs: GlideDescRun[] = [];
  let cursor = 0;

  for (const seg of segmentation.segments) {
    const canonical = seg.text;
    const slice = text.slice(cursor);
    const relIdx = slice.toLowerCase().indexOf(canonical.toLowerCase());
    if (relIdx < 0) continue;

    const absStart = cursor + relIdx;
    const absEnd = absStart + canonical.length;
    const label = text.slice(absStart, absEnd);

    if (absStart > cursor) {
      runs.push({ kind: 'text', text: text.slice(cursor, absStart) });
    }

    const displayLabel = label;
    const paint = paintForSegment(canonical);
    runs.push({
      kind: 'chip',
      text: displayLabel,
      paint: { ...paint, text: displayLabel },
    });
    cursor = absEnd;
  }

  if (cursor < text.length) {
    runs.push({ kind: 'text', text: text.slice(cursor) });
  }

  return runs.length > 0 ? runs : (text.length > 0 ? [{ kind: 'text', text }] : []);
}

function splitPreviewSegments(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const byDot = trimmed.split('.').map((s) => s.trim()).filter((s) => s.length > 0);
  if (byDot.length > 1) return byDot.slice(0, MAX_PREVIEW_CHIPS);

  const byBullet = trimmed.split(/\s*·\s*/).map((s) => s.trim()).filter((s) => s.length > 0);
  if (byBullet.length > 1) return byBullet.slice(0, MAX_PREVIEW_CHIPS);

  return [trimmed];
}

/**
 * Fast synchronous preview rows (benchmark-style colored chips, no dictionary match).
 * Shown immediately while full corpus segmentation runs in the background.
 */
export function buildCorpusGlidePreviewRows(rows: readonly CorpusRow[]): CorpusGlideRow[] {
  return rows.map((row) => {
    const segmentTexts = splitPreviewSegments(row.text);
    const segPaints = segmentTexts.map((seg, i) =>
      previewPaint(seg, PREVIEW_CHIP_COLORS[i % PREVIEW_CHIP_COLORS.length]!),
    );
    const segmentation: CorpusSegmentationEntry = {
      segments: segmentTexts.map((text) => ({ text, dictionaryId: '' })),
      unmatched: [],
      path: segmentTexts.join('.'),
    };
    return {
      rowIndex: row.rowIndex,
      text: row.text,
      descriptionRuns: buildDescriptionRunsFromSegmentation(
        row.text,
        segmentation,
        (canonical) => {
          const idx = segmentTexts.indexOf(canonical);
          return segPaints[idx >= 0 ? idx : 0]!;
        },
      ),
      segPaints,
      extraPaints: [],
      segmentation,
    };
  });
}

/**
 * Builds Glide rows from persisted segmentation (description chips from segment positions).
 * O(rows × segments) — no phrase re-match.
 */
export function buildCorpusGlideRowsFromCache(
  rows: readonly CorpusRow[],
  lookup: (text: string) => CorpusSegmentationEntry | undefined,
  loadedRefs: LoadedDictionaryRef[],
  editingDictionaryId: string | null,
  categories: TokenCategory[],
  extraAnnotations: ReadonlyMap<number, readonly string[]> = new Map(),
): CorpusGlideRow[] {
  const cats = categories.length > 0 ? categories : loadedRefs[0]?.dictionary.categories ?? [];
  const paintCache = new Map<string, GlideChipPaint>();

  const paintCached = (text: string): GlideChipPaint => {
    const cached = paintCache.get(text);
    if (cached) return cached;
    const paint = paintForSegment(text, loadedRefs, editingDictionaryId, cats);
    paintCache.set(text, paint);
    return paint;
  };

  return rows.map((row) => {
    const baseSegmentation = lookup(row.text) ?? EMPTY_SEGMENTATION;
    const extraTokens = extraAnnotations.get(row.rowIndex) ?? [];
    const segmentation = mergeExtraIntoSegmentation(baseSegmentation, extraTokens);
    const segPaints = segmentation.segments.map((seg) => paintCached(seg.text));
    const extraPaints = extraTokens.map((t) => paintCached(t));
    return {
      rowIndex: row.rowIndex,
      text: row.text,
      descriptionRuns: buildDescriptionRunsFromSegmentation(
        row.text,
        baseSegmentation,
        paintCached,
      ),
      segPaints,
      extraPaints,
      segmentation: baseSegmentation,
    };
  });
}

/**
 * Full Glide rows with dictionary-colored highlights in the description column.
 * Slower — re-runs phrase matching per row. Use buildCorpusGlideRowsFromCache for cache load.
 */
export function buildCorpusGlideRows(
  rows: readonly CorpusRow[],
  matchPhrases: MatchPhrase[],
  lookup: (text: string) => CorpusSegmentationEntry | undefined,
  loadedRefs: LoadedDictionaryRef[],
  editingDictionaryId: string | null,
  categories: TokenCategory[],
): CorpusGlideRow[] {
  const cats = categories.length > 0 ? categories : loadedRefs[0]?.dictionary.categories ?? [];

  return rows.map((row) => {
    const segmentation = lookup(row.text) ?? EMPTY_SEGMENTATION;
    return {
      rowIndex: row.rowIndex,
      text: row.text,
      descriptionRuns: buildDescriptionRuns(
        row.text,
        matchPhrases,
        loadedRefs,
        editingDictionaryId,
        cats,
      ),
      segPaints: paintsForSegmentation(
        segmentation,
        loadedRefs,
        editingDictionaryId,
        cats,
      ),
      extraPaints: [],
      segmentation,
    };
  });
}

/**
 * Maps corpus row index to precalculated Glide row (for filtered views).
 */
export function buildCorpusGlideRowMap(
  glideRows: readonly CorpusGlideRow[],
): Map<number, CorpusGlideRow> {
  const map = new Map<number, CorpusGlideRow>();
  for (const row of glideRows) {
    map.set(row.rowIndex, row);
  }
  return map;
}

/** Paints extra-column tokens with dictionary category colors. */
export function buildExtraChipPaints(
  tokens: readonly string[],
  loadedRefs: LoadedDictionaryRef[],
  editingDictionaryId: string | null,
  categories: TokenCategory[],
): GlideChipPaint[] {
  const cats = categories.length > 0 ? categories : loadedRefs[0]?.dictionary.categories ?? [];
  return tokens.map((text) => paintForSegment(text, loadedRefs, editingDictionaryId, cats));
}

function glideRowExtraMergeEquals(
  row: CorpusGlideRow,
  segPaints: CorpusGlideRow['segPaints'],
  extraPaints: CorpusGlideRow['extraPaints'],
): boolean {
  return (
    row.segPaints.length === segPaints.length
    && row.segPaints.every((paint, i) => paint.text === segPaints[i]?.text)
    && row.extraPaints.length === extraPaints.length
    && row.extraPaints.every((paint, i) => paint.text === extraPaints[i]?.text)
  );
}

/** Applies live extra annotations synchronously (no async row rebuild wait). */
export function mergeExtraAnnotationsIntoGlideRowMap(
  rowMap: ReadonlyMap<number, CorpusGlideRow>,
  extraAnnotations: ReadonlyMap<number, readonly string[]>,
  loadedRefs: LoadedDictionaryRef[],
  editingDictionaryId: string | null,
  categories: TokenCategory[],
): Map<number, CorpusGlideRow> {
  if (rowMap.size === 0) return new Map(rowMap);
  if (!extraAnnotations.size) return new Map(rowMap);

  let changed = false;
  const next = new Map(rowMap);

  for (const [rowIndex, row] of rowMap) {
    const extraTokens = extraAnnotations.get(rowIndex) ?? [];
    const mergedSegmentation = mergeExtraIntoSegmentation(row.segmentation, extraTokens);
    const segPaints = buildExtraChipPaints(
      mergedSegmentation.segments.map((seg) => seg.text),
      loadedRefs,
      editingDictionaryId,
      categories,
    );
    const extraPaints = buildExtraChipPaints(
      extraTokens,
      loadedRefs,
      editingDictionaryId,
      categories,
    );

    if (glideRowExtraMergeEquals(row, segPaints, extraPaints)) {
      continue;
    }

    changed = true;
    next.set(rowIndex, {
      ...row,
      segPaints,
      extraPaints,
    });
  }

  return changed ? next : new Map(rowMap);
}
