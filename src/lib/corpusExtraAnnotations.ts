/**
 * Per-row extra column tokens — extend catalog paths beyond text segmentation.
 */
import type { CorpusSegmentationEntry } from './corpusSegmentationCache';
import type { RowSegmentation } from './tokenDictionary';

export type CorpusExtraAnnotations = ReadonlyMap<number, readonly string[]>;
export type CorpusExtraAnnotationsStorage = Record<string, string[]>;

export function corpusExtraAnnotationsFromStorage(
  raw: CorpusExtraAnnotationsStorage | null | undefined,
): Map<number, string[]> {
  const map = new Map<number, string[]>();
  if (!raw) return map;
  for (const [key, tokens] of Object.entries(raw)) {
    const rowIndex = Number.parseInt(key, 10);
    if (!Number.isFinite(rowIndex) || rowIndex < 0) continue;
    const cleaned = tokens.map((t) => t.trim()).filter(Boolean);
    if (cleaned.length > 0) map.set(rowIndex, cleaned);
  }
  return map;
}

export function corpusExtraAnnotationsToStorage(
  annotations: CorpusExtraAnnotations,
): CorpusExtraAnnotationsStorage {
  const out: CorpusExtraAnnotationsStorage = {};
  for (const [rowIndex, tokens] of annotations.entries()) {
    const cleaned = tokens.map((t) => t.trim()).filter(Boolean);
    if (cleaned.length > 0) out[String(rowIndex)] = cleaned;
  }
  return out;
}

export function appendExtraTokens(
  annotations: ReadonlyMap<number, readonly string[]>,
  rowIndex: number,
  tokenTexts: readonly string[],
): Map<number, string[]> {
  const next = new Map<number, string[]>();
  for (const [idx, list] of annotations.entries()) next.set(idx, [...list]);
  const add = tokenTexts.map((t) => t.trim()).filter(Boolean);
  if (add.length === 0) return next;
  next.set(rowIndex, [...(next.get(rowIndex) ?? []), ...add]);
  return next;
}

export function removeExtraToken(
  annotations: ReadonlyMap<number, readonly string[]>,
  rowIndex: number,
  tokenText: string,
  occurrenceIndex0Based = 0,
): Map<number, string[]> {
  const next = new Map<number, string[]>();
  for (const [idx, list] of annotations.entries()) next.set(idx, [...list]);
  const canonical = tokenText.trim();
  const list = next.get(rowIndex);
  if (!list?.length || !canonical) return next;
  let seen = 0;
  const filtered = list.filter((t) => {
    if (t !== canonical) return true;
    if (seen === occurrenceIndex0Based) { seen += 1; return false; }
    seen += 1; return true;
  });
  if (filtered.length === 0) next.delete(rowIndex);
  else next.set(rowIndex, filtered);
  return next;
}

/** Prepends manual extra tokens to segmentation segments and path (deduped vs existing segments). */
export function mergeExtraIntoSegmentation(
  base: CorpusSegmentationEntry,
  extraTokens: readonly string[],
): CorpusSegmentationEntry {
  const cleaned = extraTokens.map((t) => t.trim()).filter(Boolean);
  if (cleaned.length === 0) return base;

  const existingLower = new Set(base.segments.map((seg) => seg.text.toLowerCase()));
  const prepended: string[] = [];

  for (const text of cleaned) {
    const key = text.toLowerCase();
    if (existingLower.has(key)) continue;
    existingLower.add(key);
    prepended.push(text);
  }

  if (prepended.length === 0) return base;

  return {
    segments: [
      ...prepended.map((text) => ({ text, dictionaryId: '' })),
      ...base.segments,
    ],
    unmatched: base.unmatched,
    path: mergeExtraTokensIntoPath(base.path, prepended),
  };
}

export function mergeExtraTokensIntoPath(basePath: string, extraTokens: readonly string[]): string {
  const baseParts = basePath.split('.').filter(Boolean);
  const extraParts = extraTokens.map((t) => t.trim()).filter(Boolean);
  if (extraParts.length === 0) return basePath.trim();
  if (baseParts.length === 0) return extraParts.join('.');
  return [...extraParts, ...baseParts].join('.');
}

export function applyExtraAnnotationsToRows(
  rows: RowSegmentation[],
  extraAnnotations: CorpusExtraAnnotations | undefined,
): RowSegmentation[] {
  if (!extraAnnotations?.size) return rows;
  return rows.map((row) => {
    const extra = extraAnnotations.get(row.rowIndex);
    if (!extra?.length) return row;
    return { ...row, path: mergeExtraTokensIntoPath(row.path, extra) };
  });
}
