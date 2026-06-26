/**
 * Catalog integrity checks: duplicate concept fingerprints, repeated path tokens, cardinality conflicts.
 */
import type { BundleCorpusItem, BundleCorpusSegment, CompiledConstraint } from './agentBundleTypes';
import type { CategoryResolutionViolation } from './categoryValueResolution';
import { findCardinalityViolationsForSegments } from './categoryValueResolution';
import type { TokenCategory } from './dictionaryTree';
import { normalizeSlotCategoryKey } from './slotExtract';
import { normalizeValueList, valueSetKey } from './valueSet';

export interface CatalogSanityItemRef {
  path: string;
  sourceText: string;
}

export interface CatalogSanityDuplicateGroup {
  fingerprint: string;
  items: CatalogSanityItemRef[];
}

export interface CatalogSanityRepeatedToken {
  sourceText: string;
  path: string;
  categoryName: string;
  segmentText: string;
  /** 1-based segment indices in the item path (for occurrence exclusion keys). */
  occurrenceIndices: number[];
  collapsedCatalogKey: string;
}

export interface CatalogSanityCardinalityViolation {
  sourceText: string;
  path: string;
  categoryName: string;
  values: string[];
}

export interface CatalogSanityReport {
  duplicates: CatalogSanityDuplicateGroup[];
  repeatedTokens: CatalogSanityRepeatedToken[];
  cardinalityViolations: CatalogSanityCardinalityViolation[];
}

interface GroupedConcept {
  kind: 'attributo' | 'vincolo';
  values: string[];
}

function groupSegments(segments: readonly BundleCorpusSegment[]): Map<string, GroupedConcept> {
  const grouped = new Map<string, GroupedConcept>();
  for (const seg of segments) {
    if (!seg.categoryName.trim()) continue;
    const existing = grouped.get(seg.categoryName) ?? {
      kind: seg.categoryType === 'vincolo' ? 'vincolo' : 'attributo',
      values: [],
    };
    existing.values.push(seg.text.trim());
    grouped.set(seg.categoryName, existing);
  }
  return grouped;
}

function formatAgeConstraint(c: CompiledConstraint): string {
  if (c.kind !== 'age_years') return '';
  const min = c.min ?? '∅';
  const max = c.max ?? '∅';
  return `${c.categoryName}=age:${min}-${max}`;
}

/** Stable fingerprint matching VB catalog concept grouping (post normalizeValueList). */
export function buildCatalogConceptFingerprint(item: BundleCorpusItem): string {
  const grouped = groupSegments(item.segments);
  const parts: string[] = [];

  for (const [category, entry] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b, 'it'))) {
    if (entry.kind === 'vincolo') {
      parts.push(`${category}=${entry.values[0] ?? ''}`);
      continue;
    }
    parts.push(`${category}=${valueSetKey(normalizeValueList(entry.values))}`);
  }

  for (const constraint of item.constraints ?? []) {
    const agePart = formatAgeConstraint(constraint);
    if (agePart) parts.push(agePart);
  }

  return parts.join(' · ');
}

function findRepeatedTokens(item: BundleCorpusItem): CatalogSanityRepeatedToken[] {
  const byCategoryText = new Map<string, number[]>();

  item.segments.forEach((seg, index) => {
    if (!seg.categoryName.trim() || !seg.text.trim()) return;
    const key = `${normalizeSlotCategoryKey(seg.categoryName)}\0${seg.text.trim().toLowerCase()}`;
    const list = byCategoryText.get(key) ?? [];
    list.push(index + 1);
    byCategoryText.set(key, list);
  });

  const out: CatalogSanityRepeatedToken[] = [];
  for (const [key, indices] of byCategoryText) {
    if (indices.length < 2) continue;
    const [categoryKey, textKey] = key.split('\0');
    const categoryName = item.segments.find(
      (s) => normalizeSlotCategoryKey(s.categoryName) === categoryKey,
    )?.categoryName ?? categoryKey;
    const segmentText = item.segments.find(
      (s) => s.text.trim().toLowerCase() === textKey,
    )?.text.trim() ?? textKey;

    const grouped = groupSegments(item.segments);
    const entry = grouped.get(categoryName);
    const collapsedCatalogKey = entry
      ? valueSetKey(normalizeValueList(entry.values))
      : segmentText;

    out.push({
      sourceText: item.sourceText,
      path: item.path,
      categoryName,
      segmentText,
      occurrenceIndices: indices,
      collapsedCatalogKey,
    });
  }

  return out.sort((a, b) => a.path.localeCompare(b.path, 'it'));
}

function findDuplicateGroups(items: readonly BundleCorpusItem[]): CatalogSanityDuplicateGroup[] {
  const byFingerprint = new Map<string, CatalogSanityItemRef[]>();

  for (const item of items) {
    const fingerprint = buildCatalogConceptFingerprint(item);
    const list = byFingerprint.get(fingerprint) ?? [];
    list.push({ path: item.path, sourceText: item.sourceText });
    byFingerprint.set(fingerprint, list);
  }

  return [...byFingerprint.entries()]
    .filter(([, refs]) => refs.length > 1)
    .map(([fingerprint, refs]) => ({
      fingerprint,
      items: refs.sort((a, b) => a.path.localeCompare(b.path, 'it')),
    }))
    .sort((a, b) => b.items.length - a.items.length);
}

function findCardinalityViolations(
  items: readonly BundleCorpusItem[],
  categories: readonly TokenCategory[],
): CatalogSanityCardinalityViolation[] {
  if (categories.length === 0) return [];
  const out: CatalogSanityCardinalityViolation[] = [];
  for (const item of items) {
    const violations: CategoryResolutionViolation[] = findCardinalityViolationsForSegments(
      item.segments,
      [...categories],
    );
    for (const v of violations) {
      out.push({
        sourceText: item.sourceText,
        path: item.path,
        categoryName: v.categoryName,
        values: v.values,
      });
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path, 'it'));
}

/** Analyzes compiled corpus items for catalog integrity issues. */
export function analyzeCatalogSanity(
  items: readonly BundleCorpusItem[],
  categories: readonly TokenCategory[] = [],
): CatalogSanityReport {
  const duplicates = findDuplicateGroups(items);
  const repeatedTokens = items.flatMap(findRepeatedTokens);
  const cardinalityViolations = findCardinalityViolations(items, categories);

  return { duplicates, repeatedTokens, cardinalityViolations };
}

/** True when the report lists duplicate fingerprints or repeated path tokens. */
export function hasCatalogSanityIssues(report: CatalogSanityReport | null | undefined): boolean {
  if (!report) return false;
  return report.duplicates.length > 0
    || report.repeatedTokens.length > 0
    || report.cardinalityViolations.length > 0;
}

/** Badge count for the Report tab (groups + repeated-token rows). */
export function catalogSanityIssueCount(report: CatalogSanityReport | null | undefined): number {
  if (!report) return 0;
  return report.duplicates.length
    + report.repeatedTokens.length
    + report.cardinalityViolations.length;
}

/** Human-readable warnings for bundle meta.warnings. */
export function catalogSanityWarnings(report: CatalogSanityReport): string[] {
  const warnings: string[] = [];

  for (const group of report.duplicates) {
    const paths = group.items.map((i) => i.path).join(', ');
    warnings.push(
      `Duplicazione catalogo (${group.items.length} item indistinguibili): ${paths}`,
    );
  }

  for (const row of report.repeatedTokens) {
    warnings.push(
      `Token ripetuto "${row.segmentText}" (${row.categoryName}) in ${row.path} `
      + `[${row.occurrenceIndices.join(', ')}] → catalogo: "${row.collapsedCatalogKey}"`,
    );
  }

  for (const row of report.cardinalityViolations) {
    warnings.push(
      `Cardinalità singola violata (${row.categoryName}) in ${row.path}: `
      + `${row.values.join(', ')}`,
    );
  }

  return warnings;
}
