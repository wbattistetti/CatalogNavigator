/**
 * Normalizes VB parsed concepts (values[] or value) for TS clients.
 */
export interface NormalizedVbParsedConcept {
  category: string;
  value: string;
  kind?: string;
}

/** Maps a raw VB parsed entry to category + joined canonical value. */
export function normalizeVbParsedEntry(raw: unknown): NormalizedVbParsedConcept | null {
  const row = raw as {
    category?: string;
    categoryName?: string;
    value?: string;
    values?: unknown;
    kind?: string;
  };

  const category = String(row.category ?? row.categoryName ?? '').trim();
  if (!category) return null;

  const values: string[] = [];
  if (Array.isArray(row.values)) {
    for (const entry of row.values) {
      if (typeof entry === 'string' && entry.trim()) values.push(entry.trim());
    }
  } else if (typeof row.value === 'string' && row.value.trim()) {
    values.push(row.value.trim());
  }

  if (values.length === 0) return null;

  return {
    category,
    value: values.join('+'),
    kind: typeof row.kind === 'string' ? row.kind : undefined,
  };
}

export function normalizeVbParsedList(raw: unknown): NormalizedVbParsedConcept[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => normalizeVbParsedEntry(entry))
    .filter((entry): entry is NormalizedVbParsedConcept => entry != null);
}
