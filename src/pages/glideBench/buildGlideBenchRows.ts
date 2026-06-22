/**
 * Builds benchmark rows (#, description, segmentation) from parsed tabular CSV data.
 */
import type { ParsedTabular } from '../../lib/parseTabular';
import { buildRowOntologyText } from '../../lib/columnRoles';
import type { CorpusSegmentationEntry } from '../../lib/corpusSegmentationCache';
import { lookupCorpusSegmentation } from '../../lib/corpusSegmentationCache';
import { chipSurfaceStyleFromColor, resolveChipAppearance } from '../../lib/categoryIconCatalog';
import type { LoadedDictionaryRef } from '../../lib/multiDictionarySegment';
import type { TokenCategory } from '../../lib/dictionaryTree';
import type { TokenEntry } from '../../lib/tokenDictionary';
import type { GlideBenchRow, GlideBenchSegPaint } from './glideBenchTypes';

const PREFERRED_DESCRIPTION_COLUMNS = [
  'medicinale_veterinario',
  'descrizione_confezione',
  'principio_attivo',
] as const;

/** Resolves description source columns present in the CSV headers. */
export function resolveBenchDescriptionColumns(headers: readonly string[]): string[] {
  const preferred = PREFERRED_DESCRIPTION_COLUMNS.filter((h) => headers.includes(h));
  if (preferred.length > 0) return [...preferred];
  const byName = headers.find((h) => /descri/i.test(h));
  if (byName) return [byName];
  return headers.length > 0 ? [headers[0]!] : [];
}

function paintsForSegmentation(
  entry: CorpusSegmentationEntry,
  loadedRefs: LoadedDictionaryRef[],
  categories: TokenCategory[],
): GlideBenchSegPaint[] {
  return entry.segments.map((seg) => {
    const appearance = resolveChipAppearance(seg.text, loadedRefs, null, categories);
    const surface = chipSurfaceStyleFromColor(appearance.categoryColor);
    return {
      text: seg.text,
      bgColor: surface.backgroundColor,
      borderColor: surface.borderColor,
      fgColor: surface.color,
    };
  });
}

/** Maps parsed CSV + segmentation cache to ordered benchmark rows (CSV row order). */
export function buildGlideBenchRows(
  tabular: ParsedTabular,
  cache: Map<string, CorpusSegmentationEntry>,
  loadedRefs: LoadedDictionaryRef[],
  fallbackCategories: TokenCategory[],
): GlideBenchRow[] {
  const descColumns = resolveBenchDescriptionColumns(tabular.headers);
  const categories = loadedRefs[0]?.dictionary.categories ?? fallbackCategories;

  return tabular.rows.map((row, sourceIndex) => {
    const description = buildRowOntologyText(row, tabular.headers, descColumns);
    const segmentation = lookupCorpusSegmentation(cache, description)
      ?? { segments: [], unmatched: [], path: '' };
    return {
      sourceIndex,
      description,
      segmentation,
      paints: paintsForSegmentation(segmentation, loadedRefs, categories),
    };
  });
}

/** Fallback token list from principio_attivo when Farmaci dictionary is unavailable. */
export function buildFallbackTokensFromCsv(tabular: ParsedTabular): TokenEntry[] {
  const idx = tabular.headers.indexOf('principio_attivo');
  if (idx < 0) return [];

  const seen = new Set<string>();
  const tokens: TokenEntry[] = [];
  for (const row of tabular.rows) {
    const value = row[idx]?.trim();
    if (!value || value === '-') continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tokens.push({ text: value, enabled: true });
  }
  return tokens;
}
