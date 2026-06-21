/**
 * Natural opening utterance for dialog test scripts.
 */

/** First user turn: natural booking phrase from the corpus description line. */
export function buildNaturalOpeningUtterance(sourceText: string): string {
  const raw = sourceText.trim();
  if (!raw) return '';
  if (/^(vorrei|voglio|desidero)\b/i.test(raw)) return raw;
  const normalized = raw.replace(/_/g, ' ').toLowerCase().replace(/\s+/g, ' ').trim();
  return `Vorrei prenotare ${normalized}`;
}
