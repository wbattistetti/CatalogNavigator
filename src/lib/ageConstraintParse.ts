/**
 * Parses Italian age-band constraint tokens into numeric min/max for Convai KB export.
 */

export interface AgeConstraintRange {
  min: number | null;
  max: number | null;
}

function normalizeAgeConstraintText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

function parseIntSafe(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Extracts inclusive age bounds from a vincolo token (e.g. "da 6 anni a 15 anni", "> 17 anni").
 * Returns null when no numeric age pattern is recognized.
 */
export function parseAgeConstraintToken(text: string): AgeConstraintRange | null {
  const n = normalizeAgeConstraintText(text);
  if (!n) return null;

  const rangeMatch = n.match(/(?:da|dai)\s*(\d+)(?:\s*anni)?\s*(?:a|ai|e|-)\s*(\d+)/);
  if (rangeMatch) {
    const min = parseIntSafe(rangeMatch[1]!);
    const max = parseIntSafe(rangeMatch[2]!);
    if (min == null || max == null) return null;
    return { min, max };
  }

  const hyphenMatch = n.match(/(\d+)\s*-\s*(\d+)/);
  if (hyphenMatch) {
    const min = parseIntSafe(hyphenMatch[1]!);
    const max = parseIntSafe(hyphenMatch[2]!);
    if (min == null || max == null) return null;
    return { min, max };
  }

  const strictGreater = n.match(/(?:>|over|oltre|sopra(?:\s+i)?)\s*(\d+)/);
  if (strictGreater) {
    const bound = parseIntSafe(strictGreater[1]!);
    if (bound == null) return null;
    return { min: bound + 1, max: null };
  }

  const fromAge = n.match(/(?:dai|da|>=|≥)\s*(\d+)(?:\s*anni)?(?:\s+in\s+su)?/);
  if (fromAge) {
    const min = parseIntSafe(fromAge[1]!);
    if (min == null) return null;
    return { min, max: null };
  }

  return null;
}

/** Appends machine-readable age bounds when the vincolo token is parseable. */
export function formatAgeConstraintKbValue(tokenValue: string): string {
  const range = parseAgeConstraintToken(tokenValue);
  if (!range) return tokenValue;
  const minPart = range.min != null ? String(range.min) : 'null';
  const maxPart = range.max != null ? String(range.max) : 'null';
  return `${tokenValue} | età_min: ${minPart} | età_max: ${maxPart}`;
}
