/**
 * Pure corpus row model: build sorted rows and apply description filter.
 */

export interface CorpusRow {
  rowIndex: number;
  text: string;
}

export interface CorpusFilterStats {
  visible: number;
  total: number;
  active: boolean;
}

/** Builds sorted non-empty corpus rows from raw description strings. */
export function buildCorpusRows(descriptions: string[]): CorpusRow[] {
  return descriptions
    .map((text, rowIndex) => ({ rowIndex, text: text.trim() }))
    .filter((r) => r.text.length > 0)
    .sort((a, b) => a.text.localeCompare(b.text, 'it', { sensitivity: 'base' }));
}

/** Splits a filter query into lowercase terms (whitespace-separated). */
export function parseCorpusFilterTerms(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter((term) => term.length > 0);
}

/** Filters rows where every query term appears as substring (case-insensitive AND). */
export function filterCorpusRows(rows: CorpusRow[], query: string): CorpusRow[] {
  const terms = parseCorpusFilterTerms(query);
  if (terms.length === 0) return rows;
  return rows.filter((row) => {
    const haystack = row.text.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

export function corpusFilterStats(
  visible: number,
  total: number,
  filterActive: boolean,
): CorpusFilterStats {
  return { visible, total, active: filterActive };
}
