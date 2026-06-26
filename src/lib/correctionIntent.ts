/**
 * Client-side mirror of VB CorrectionIntent for chat debug (correction vs pending answer).
 */

export interface CorrectionParseResult {
  isCorrection: boolean;
  payloadText: string;
}

const CORRECTION_PATTERN =
  /^\s*(?:no\s*,?\s*)?(?:(?:mi\s+sono\s+sbagliat[oa]|ho\s+sbagliato|scus(?:ami|a|i|ate)|in\s+realta|correggo)\s*,?\s*(?:(?:intendevo|volevo(?:\s+dire)?)\s+)?|(?:(?:intendevo|volevo(?:\s+dire)?)\s+))(?<payload>.+?)\s*$/iu;

const LEADING_FILLER_PATTERN =
  /^(?:(?:volevo(?:\s+dire)?|intendevo|in\s+realta)\s+|(?:un[oa]?|il|la|lo|l'|i|gli|le)\s+)+/iu;

/** Strips leading filler words from a correction payload. */
export function normalizeCorrectionPayload(payload: string): string {
  let text = payload.trim();
  if (!text) return '';

  let previous = '';
  while (text && text !== previous) {
    previous = text;
    text = text.replace(LEADING_FILLER_PATTERN, '').trim();
  }
  return text;
}

/** Returns correction payload when utterance expresses a retroactive fix. */
export function parseCorrectionIntent(utterance: string): CorrectionParseResult {
  const text = utterance.trim();
  if (!text) return { isCorrection: false, payloadText: '' };

  const match = CORRECTION_PATTERN.exec(text);
  if (!match?.groups?.payload) return { isCorrection: false, payloadText: '' };

  const payload = normalizeCorrectionPayload(match.groups.payload);
  if (!payload) return { isCorrection: false, payloadText: '' };

  return { isCorrection: true, payloadText: payload };
}
