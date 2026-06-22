/**
 * String sanitization for PostgreSQL jsonb (rejects U+0000 in JSON strings).
 */

/** PostgreSQL text/jsonb reject U+0000 in string values. */
export function sanitizeStringForPostgresJsonb(value: string): string {
  if (!value) return value;
  const withoutNull = value.split('\u0000').join('');
  const bytes = new TextEncoder().encode(withoutNull);
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

export interface PostgresSafeSegmentationEntry {
  segments: { text: string; dictionaryId: string }[];
  unmatched: string[];
  path: string;
}

export function sanitizeSegmentationEntry(
  entry: PostgresSafeSegmentationEntry,
): PostgresSafeSegmentationEntry {
  return {
    path: sanitizeStringForPostgresJsonb(entry.path),
    unmatched: entry.unmatched.map(sanitizeStringForPostgresJsonb),
    segments: entry.segments.map((seg) => ({
      text: sanitizeStringForPostgresJsonb(seg.text),
      dictionaryId: sanitizeStringForPostgresJsonb(seg.dictionaryId),
    })),
  };
}

export function sanitizeSegmentationEntries(
  entries: Record<string, PostgresSafeSegmentationEntry>,
): Record<string, PostgresSafeSegmentationEntry> {
  const out: Record<string, PostgresSafeSegmentationEntry> = {};
  for (const [rawKey, rawEntry] of Object.entries(entries)) {
    const key = sanitizeStringForPostgresJsonb(rawKey.trim());
    if (!key) continue;
    out[key] = sanitizeSegmentationEntry(rawEntry);
  }
  return out;
}
