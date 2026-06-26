/**
 * Normalizes Italian age utterances before vincolo resolution (STT apostrophes, truncations, units).
 */

const AGE_UNITS =
  'anni|anno|mesi|mese|settimane|settimana|giorni|giorno';

/** Colloquial tens stems from STT (trent'anni → trenta anni). */
const TRUNCATED_STEM_MAP: Readonly<Record<string, string>> = {
  vent: 'venti',
  trent: 'trenta',
  quarant: 'quaranta',
  cinquant: 'cinquanta',
  sessant: 'sessanta',
  settant: 'settenta',
  ottant: 'ottanta',
  novant: 'novanta',
};

const APOSTROPHE_WORD_UNIT = new RegExp(
  String.raw`\b([\w]+)'?\s*(${AGE_UNITS})\b`,
  'gi',
);

/** Expands truncated Italian age word stems (trent → trenta). */
export function expandTruncatedAgeStem(stem: string): string {
  const cleaned = stem.replace(/'/g, '').trim().toLowerCase();
  return TRUNCATED_STEM_MAP[cleaned] ?? stem;
}

/** Normalizes age text for pipeline matching (accents, apostrophes, STT variants). */
export function normalizeAgeUtterance(text: string): string {
  let normalized = text.trim().toLowerCase();
  if (!normalized) return '';

  normalized = normalized
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

  normalized = normalized.replace(/[\u2018\u2019\u201B\u0060]/g, "'");

  normalized = normalized.replace(/\s+/g, ' ');
  normalized = normalized.replace(/[.,!?;:]+$/g, '').trim();

  normalized = normalized.replace(
    APOSTROPHE_WORD_UNIT,
    (_match, stem: string, unit: string) => `${expandTruncatedAgeStem(stem)} ${unit}`,
  );

  return normalized.trim();
}
