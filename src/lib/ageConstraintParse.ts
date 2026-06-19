/**
 * Parses Italian age-band constraint tokens into numeric bounds for bundle compile and Convai export.
 * Produces both legacy year bounds and inclusive total-month bounds for sub-year fasce (settimane, mesi).
 */

export type AgeConstraintUnit = 'years' | 'months' | 'weeks' | 'days';

export interface AgeConstraintRange {
  /** Inclusive lower bound in whole years (legacy Convai hints). */
  min: number | null;
  /** Inclusive upper bound in whole years (legacy Convai hints). */
  max: number | null;
  /** Inclusive lower bound in total months for runtime filtering. */
  minMonths: number | null;
  /** Inclusive upper bound in total months for runtime filtering. */
  maxMonths: number | null;
}

const ITALIAN_NUMBER_WORDS: Readonly<Record<string, number>> = {
  zero: 0,
  uno: 1,
  una: 1,
  due: 2,
  tre: 3,
  quattro: 4,
  cinque: 5,
  sei: 6,
  sette: 7,
  otto: 8,
  nove: 9,
  dieci: 10,
  undici: 11,
  dodici: 12,
  tredici: 13,
  quattordici: 14,
  quindici: 15,
  sedici: 16,
  diciassette: 17,
  diciotto: 18,
  diciannove: 19,
  venti: 20,
  trenta: 30,
  quaranta: 40,
  cinquanta: 50,
  sessanta: 60,
  settanta: 70,
  ottanta: 80,
  novanta: 90,
  cento: 100,
};

const UNIT_PATTERN =
  '(?:anni|anno|mesi|mese|settimane|settimana|giorni|giorno|settimana di vita|settimane di vita)';
const UNIT_CAPTURE =
  '(anni|anno|mesi|mese|settimane|settimana|giorni|giorno|settimana di vita|settimane di vita)';

function normalizeAgeConstraintText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[''`]/g, '')
    .replace(/\s+/g, ' ');
}

const RANGE_CONNECTOR = '(?:\\s+a\\s+|\\s+ai\\s+|\\s+e\\s+|-)';

function parseIntSafe(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

function parseNumberToken(raw: string | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const asInt = parseIntSafe(trimmed);
  if (asInt != null) return asInt;
  return ITALIAN_NUMBER_WORDS[trimmed] ?? null;
}

function parseUnitToken(raw: string | undefined): AgeConstraintUnit {
  const unit = (raw ?? '').trim().toLowerCase();
  if (unit.startsWith('mes')) return 'months';
  if (unit.startsWith('settiman') || unit.includes('settiman')) return 'weeks';
  if (unit.startsWith('giorn')) return 'days';
  return 'years';
}

function unitsForRange(text: string): { minUnit: AgeConstraintUnit; maxUnit: AgeConstraintUnit } {
  const units = [...text.matchAll(new RegExp(UNIT_CAPTURE, 'gi'))].map((m) =>
    parseUnitToken(m[1]),
  );
  if (units.length === 0) return { minUnit: 'years', maxUnit: 'years' };
  if (units.length === 1) return { minUnit: units[0]!, maxUnit: units[0]! };
  return { minUnit: units[0]!, maxUnit: units[units.length - 1]! };
}

function unitAfterQuantity(text: string, value: number): AgeConstraintUnit {
  const re = new RegExp(`${value}\\s*${UNIT_CAPTURE}`, 'i');
  const match = text.match(re);
  return match?.[1] ? parseUnitToken(match[1]) : 'years';
}

function quantityToMinMonths(value: number, unit: AgeConstraintUnit): number {
  switch (unit) {
    case 'years':
      return value * 12;
    case 'months':
      return value;
    case 'weeks':
      return Math.floor((value * 7) / 30.44);
    case 'days':
      return Math.floor(value / 30.44);
    default:
      return value * 12;
  }
}

/** Inclusive upper bound in total months for a quantity expressed in the given unit. */
function quantityToMaxMonths(value: number, unit: AgeConstraintUnit): number {
  switch (unit) {
    case 'years':
      return value * 12 + 11;
    case 'months':
      return value;
    case 'weeks':
      return Math.max(0, Math.ceil((value * 7) / 30.44) - 1);
    case 'days':
      return Math.max(0, Math.ceil(value / 30.44) - 1);
    default:
      return value * 12 + 11;
  }
}

function yearsFromMinMonths(minMonths: number | null): number | null {
  if (minMonths == null) return null;
  return Math.floor(minMonths / 12);
}

function yearsFromMaxMonths(maxMonths: number | null): number | null {
  if (maxMonths == null) return null;
  return Math.floor(maxMonths / 12);
}

function buildRange(
  minQty: number | null,
  minUnit: AgeConstraintUnit | null,
  maxQty: number | null,
  maxUnit: AgeConstraintUnit | null,
): AgeConstraintRange | null {
  const minMonths =
    minQty != null && minUnit != null ? quantityToMinMonths(minQty, minUnit) : null;
  const maxMonths =
    maxQty != null && maxUnit != null ? quantityToMaxMonths(maxQty, maxUnit) : null;

  if (minMonths == null && maxMonths == null) return null;
  if (minMonths != null && maxMonths != null && minMonths > maxMonths) return null;

  return {
    min: yearsFromMinMonths(minMonths),
    max: yearsFromMaxMonths(maxMonths),
    minMonths,
    maxMonths,
  };
}

function parseQuantityWithUnit(
  text: string,
): { value: number; unit: AgeConstraintUnit } | null {
  const match = text.match(new RegExp(`^(\\d+|${Object.keys(ITALIAN_NUMBER_WORDS).join('|')})\\s*${UNIT_PATTERN}$`, 'i'));
  if (!match) return null;
  const value = parseNumberToken(match[1]);
  if (value == null) return null;
  return { value, unit: unitAfterQuantity(text, value) };
}

function tryEntroPattern(n: string): AgeConstraintRange | null {
  const match = n.match(
    new RegExp(
      `^entro(?:\\s+le)?(?:\\s+prime)?\\s+(\\d+|${Object.keys(ITALIAN_NUMBER_WORDS).join('|')})\\s*${UNIT_PATTERN}(?:\\s+di\\s+vita)?$`,
      'i',
    ),
  );
  if (!match) return null;
  const value = parseNumberToken(match[1]);
  if (value == null) return null;
  return buildRange(0, 'months', value, unitAfterQuantity(n, value));
}

function tryFinoAPattern(n: string): AgeConstraintRange | null {
  const match = n.match(
    new RegExp(
      `^fino\\s+a(?:i)?\\s+(\\d+|${Object.keys(ITALIAN_NUMBER_WORDS).join('|')})\\s*${UNIT_PATTERN}$`,
      'i',
    ),
  );
  if (!match) return null;
  const value = parseNumberToken(match[1]);
  if (value == null) return null;
  return buildRange(0, 'months', value, unitAfterQuantity(n, value));
}

function tryDaFinoAPattern(n: string): AgeConstraintRange | null {
  const match = n.match(
    new RegExp(
      `^(?:da|dai)\\s+(\\d+|${Object.keys(ITALIAN_NUMBER_WORDS).join('|')})(?:\\s*${UNIT_PATTERN})?\\s+fino\\s+a(?:i)?\\s+(\\d+|${Object.keys(ITALIAN_NUMBER_WORDS).join('|')})(?:\\s*${UNIT_PATTERN})?$`,
      'i',
    ),
  );
  if (!match) return null;
  const minValue = parseNumberToken(match[1]);
  const maxValue = parseNumberToken(match[2]);
  if (minValue == null || maxValue == null) return null;
  const { minUnit, maxUnit } = unitsForRange(n);
  return buildRange(minValue, minUnit, maxValue, maxUnit);
}

function tryDaAPattern(n: string): AgeConstraintRange | null {
  const match = n.match(
    new RegExp(
      `^(?:da|dai)\\s+(\\d+|${Object.keys(ITALIAN_NUMBER_WORDS).join('|')})(?:\\s*${UNIT_PATTERN})?${RANGE_CONNECTOR}(\\d+|${Object.keys(ITALIAN_NUMBER_WORDS).join('|')})(?:\\s*${UNIT_PATTERN})?$`,
      'i',
    ),
  );
  if (!match) return null;
  const minValue = parseNumberToken(match[1]);
  const maxValue = parseNumberToken(match[2]);
  if (minValue == null || maxValue == null) return null;
  const { minUnit, maxUnit } = unitsForRange(n);
  return buildRange(minValue, minUnit, maxValue, maxUnit);
}

function trySpacedNumberRange(n: string): AgeConstraintRange | null {
  const match = n.match(
    new RegExp(
      `^(\\d+|${Object.keys(ITALIAN_NUMBER_WORDS).join('|')})\\s+(\\d+|${Object.keys(ITALIAN_NUMBER_WORDS).join('|')})\\s*${UNIT_PATTERN}$`,
      'i',
    ),
  );
  if (!match) return null;
  const minValue = parseNumberToken(match[1]);
  const maxValue = parseNumberToken(match[2]);
  if (minValue == null || maxValue == null) return null;
  const { maxUnit: unit } = unitsForRange(n);
  return buildRange(minValue, unit, maxValue, unit);
}

function tryHyphenRange(n: string): AgeConstraintRange | null {
  const withUnit = n.match(
    new RegExp(
      `^(\\d+|${Object.keys(ITALIAN_NUMBER_WORDS).join('|')})\\s*-\\s*(\\d+|${Object.keys(ITALIAN_NUMBER_WORDS).join('|')})\\s*${UNIT_PATTERN}$`,
      'i',
    ),
  );
  if (withUnit) {
    const minValue = parseNumberToken(withUnit[1]);
    const maxValue = parseNumberToken(withUnit[2]);
    if (minValue == null || maxValue == null) return null;
    const { maxUnit: unit } = unitsForRange(n);
    return buildRange(minValue, unit, maxValue, unit);
  }

  const bare = n.match(/^(\d+)\s*-\s*(\d+)$/);
  if (!bare) return null;
  const minValue = parseIntSafe(bare[1]!);
  const maxValue = parseIntSafe(bare[2]!);
  if (minValue == null || maxValue == null) return null;
  return buildRange(minValue, 'years', maxValue, 'years');
}

function tryTraPattern(n: string): AgeConstraintRange | null {
  const match = n.match(
    new RegExp(
      `^tra\\s+(\\d+|${Object.keys(ITALIAN_NUMBER_WORDS).join('|')})(?:\\s*${UNIT_PATTERN})?\\s+e\\s+(\\d+|${Object.keys(ITALIAN_NUMBER_WORDS).join('|')})(?:\\s*${UNIT_PATTERN})?$`,
      'i',
    ),
  );
  if (!match) return null;
  const minValue = parseNumberToken(match[1]);
  const maxValue = parseNumberToken(match[2]);
  if (minValue == null || maxValue == null) return null;
  const { minUnit, maxUnit } = unitsForRange(n);
  return buildRange(minValue, minUnit, maxValue, maxUnit);
}

function tryStrictGreater(n: string): AgeConstraintRange | null {
  const match = n.match(
    new RegExp(
      `^(?:>|over|oltre|sopra(?:\\s+i)?|maggiore(?:\\s+di)?|piu di|più di)\\s*(\\d+|${Object.keys(ITALIAN_NUMBER_WORDS).join('|')})(?:\\s*${UNIT_PATTERN})?`,
      'i',
    ),
  );
  if (!match) return null;
  const bound = parseNumberToken(match[1]);
  if (bound == null) return null;
  const unit = unitAfterQuantity(n, bound);
  const minMonths = quantityToMaxMonths(bound, unit) + 1;
  return {
    min: yearsFromMinMonths(minMonths),
    max: null,
    minMonths,
    maxMonths: null,
  };
}

function trySottoPattern(n: string): AgeConstraintRange | null {
  const match = n.match(
    new RegExp(
      `^sotto(?:\\s+i)?\\s+(\\d+|${Object.keys(ITALIAN_NUMBER_WORDS).join('|')})(?:\\s*${UNIT_PATTERN})?`,
      'i',
    ),
  );
  if (!match) return null;
  const bound = parseNumberToken(match[1]);
  if (bound == null) return null;
  const unit = unitAfterQuantity(n, bound);
  const maxMonths = quantityToMinMonths(bound, unit) - 1;
  if (maxMonths < 0) return null;
  return {
    min: 0,
    max: yearsFromMaxMonths(maxMonths),
    minMonths: 0,
    maxMonths,
  };
}

function tryFromAge(n: string): AgeConstraintRange | null {
  const match = n.match(
    new RegExp(
      `^(?:dai|da|>=|≥)\\s*(\\d+|${Object.keys(ITALIAN_NUMBER_WORDS).join('|')})(?:\\s*${UNIT_PATTERN})?(?:\\s+in\\s+su)?$`,
      'i',
    ),
  );
  if (!match) return null;
  const minValue = parseNumberToken(match[1]);
  if (minValue == null) return null;
  const unit = unitAfterQuantity(n, minValue);
  const minMonths = quantityToMinMonths(minValue, unit);
  return {
    min: yearsFromMinMonths(minMonths),
    max: null,
    minMonths,
    maxMonths: null,
  };
}

function tryNeonatalAliases(n: string): AgeConstraintRange | null {
  if (/^(neonatale|neonati|appena nato|appena nata)$/.test(n)) {
    return buildRange(0, 'months', 1, 'months');
  }
  return null;
}

/**
 * Extracts inclusive age bounds from a vincolo token (e.g. "da 6 anni a 15 anni", "entro le prime 4 settimane di vita").
 * Returns null when no numeric age pattern is recognized.
 */
export function parseAgeConstraintToken(text: string): AgeConstraintRange | null {
  const n = normalizeAgeConstraintText(text);
  if (!n) return null;

  const parsers = [
    tryEntroPattern,
    tryFinoAPattern,
    tryDaFinoAPattern,
    tryDaAPattern,
    trySpacedNumberRange,
    tryHyphenRange,
    tryTraPattern,
    tryStrictGreater,
    trySottoPattern,
    tryFromAge,
    tryNeonatalAliases,
  ];

  for (const parser of parsers) {
    const range = parser(n);
    if (range) return range;
  }

  const singleQty = parseQuantityWithUnit(n);
  if (singleQty) {
    return buildRange(singleQty.value, singleQty.unit, singleQty.value, singleQty.unit);
  }

  return null;
}

/** Appends machine-readable age bounds when the vincolo token is parseable. */
export function formatAgeConstraintKbValue(tokenValue: string): string {
  const range = parseAgeConstraintToken(tokenValue);
  if (!range) return tokenValue;
  const minPart = range.min != null ? String(range.min) : 'null';
  const maxPart = range.max != null ? String(range.max) : 'null';
  const minMonthsPart = range.minMonths != null ? String(range.minMonths) : 'null';
  const maxMonthsPart = range.maxMonths != null ? String(range.maxMonths) : 'null';
  return `${tokenValue} | età_min: ${minPart} | età_max: ${maxPart} | età_min_mesi: ${minMonthsPart} | età_max_mesi: ${maxMonthsPart}`;
}
