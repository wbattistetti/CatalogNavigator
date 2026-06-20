/**
 * Keys for corpus segment exclusions: whole token text or a single occurrence (1-based).
 */

const OCCURRENCE_SUFFIX = /^(.+)@(\d+)$/;

/** Excludes every segment with this text on the row. */
export function segmentExclusionKeyAll(segmentText: string): string {
  return segmentText.trim();
}

/** Excludes one occurrence (1-based index in the row segment list). */
export function segmentExclusionKeyOccurrence(segmentText: string, occurrenceIndex1Based: number): string {
  const text = segmentText.trim();
  if (occurrenceIndex1Based < 1) {
    throw new RangeError('occurrenceIndex1Based must be >= 1');
  }
  return `${text}@${occurrenceIndex1Based}`;
}

export function parseSegmentExclusionKey(key: string): { text: string; occurrence1Based?: number } {
  const trimmed = key.trim();
  const match = OCCURRENCE_SUFFIX.exec(trimmed);
  if (!match) return { text: trimmed };
  const occurrence1Based = Number.parseInt(match[2]!, 10);
  if (!Number.isFinite(occurrence1Based) || occurrence1Based < 1) {
    return { text: trimmed };
  }
  return { text: match[1]!, occurrence1Based };
}

export function isOccurrenceExclusionKey(key: string): boolean {
  return parseSegmentExclusionKey(key).occurrence1Based != null;
}
