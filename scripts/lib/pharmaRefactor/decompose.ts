/**
 * Decomposes monolithic pharma catalog phrases into atomic dictionary tokens.
 */
import type { PharmaCategoryName } from '../pharmaDictionaryCategories';
import type { SourceCategoryName } from './types';
import {
  formatKgRange,
  formatQuantity,
  normalizeKey,
  normalizePhrase,
  parseItalianNumber,
} from './normalize';
import {
  BRAND_COMPOSITE_RE,
  BRAND_STOP_PATTERNS,
  CONTAINER_CANONICAL,
  DOSE_IN_PRINCIPIO_RE,
  DOSAGE_VALUE_RE,
  GALENIC_FORMS,
  MATERIAL_CANONICAL,
  MAX_PURE_BRAND_WORDS,
  MODALITY_CANONICAL,
  QUANTITY_RE,
  REGIME_PHRASES,
  SPECIES_SHORT,
} from './vocabulary';

export interface TokenAssignment {
  text: string;
  category: PharmaCategoryName;
}

export interface AliasAssignment {
  phrase: string;
  canonical: string;
}

export interface DecomposeResult {
  tokens: TokenAssignment[];
  aliases: AliasAssignment[];
}

function pushUnique(
  out: TokenAssignment[],
  seen: Set<string>,
  text: string,
  category: PharmaCategoryName,
): void {
  const phrase = normalizePhrase(text);
  const key = `${category}::${normalizeKey(phrase)}`;
  if (!phrase || seen.has(key)) return;
  seen.add(key);
  out.push({ text: phrase, category });
}

function pushAlias(aliases: AliasAssignment[], phrase: string, canonical: string): void {
  const p = normalizePhrase(phrase);
  const c = normalizePhrase(canonical);
  if (!p || !c || normalizeKey(p) === normalizeKey(c)) return;
  if (aliases.some((a) => normalizeKey(a.phrase) === normalizeKey(p))) return;
  aliases.push({ phrase: p, canonical: c });
}

/** Extracts commercial brand (first segment before dose/form keywords). */
export function extractBrandName(text: string): { brand: string; remainder: string } {
  const source = normalizePhrase(text);
  let cutIndex = source.length;
  for (const pattern of BRAND_STOP_PATTERNS) {
    const match = pattern.exec(source);
    if (match && match.index < cutIndex) cutIndex = match.index;
  }
  const brand = normalizeBrandStem(
    cutIndex < source.length ? source.slice(0, cutIndex) : source,
  );
  const remainder = cutIndex < source.length ? normalizePhrase(source.slice(cutIndex)) : '';
  if (!brand) return { brand: source, remainder: '' };
  return { brand, remainder };
}

/** Normalizes brand stem: hyphens, trailing species/route suffixes. */
export function normalizeBrandStem(brand: string): string {
  let s = normalizePhrase(brand).replace(/\s*-\s*/g, ' ');
  s = normalizePhrase(s);
  const trims = [
    /\s+spot\s+(?:on\s+)?(?:cani|gatti)\s*$/i,
    /\s+spot\s+on\s*$/i,
    /\s+spot\s*$/i,
    /\s+(?:cani|gatti|bovini|suini|ovini|cavalli|equini|pecore|avicoli|roditori|ruminanti)\s*$/i,
  ];
  for (const re of trims) s = normalizePhrase(s.replace(re, ''));
  return s || normalizePhrase(brand);
}

/** True when text still looks like a catalog line, not a pure brand. */
export function needsBrandDecomposition(text: string): boolean {
  const n = normalizeBrandStem(text);
  if (!n) return false;
  if (BRAND_COMPOSITE_RE.test(n)) return true;
  return n.split(/\s+/).length > MAX_PURE_BRAND_WORDS;
}

/** True when text is a short brand / product line suitable as Nome commerciale canonical. */
export function isPureBrandName(text: string): boolean {
  const source = normalizePhrase(text);
  const n = normalizeBrandStem(source);
  if (!n) return false;
  if (normalizeKey(n) !== normalizeKey(source)) return false;
  if (needsBrandDecomposition(n)) return false;
  return n.split(/\s+/).length <= MAX_PURE_BRAND_WORDS;
}

/** Parses dog/cat weight bands into normalized kg range tokens. */
export function parseWeightBand(text: string): string | null {
  const lower = text.toLowerCase();

  const between =
    lower.match(/\bda\s+(\d+[.,]?\d*)\s*kg\s+a\s+(\d+[.,]?\d*)\s*kg\b/) ??
    lower.match(
      /(?:compreso\s+)?da\s+(\d+[.,]?\d*)\s*(?:kg\s*)?a\s+(\d+[.,]?\d*)\s*kg/,
    ) ??
    lower.match(/tra\s+(\d+[.,]?\d*)\s*(?:kg\s*)?(?:e|a)\s+(\d+[.,]?\d*)\s*kg/) ??
    lower.match(/(\d+[.,]?\d*)\s*[-–]\s*(\d+[.,]?\d*)\s*kg/);

  if (between) {
    const min = parseItalianNumber(between[1]!);
    const max = parseItalianNumber(between[2]!);
    if (min != null && max != null) return formatKgRange(min, max);
  }

  if (!lower.includes('peso') && !lower.includes(' kg')) return null;

  const fino = lower.match(/fino\s+a\s+(\d+[.,]?\d*)\s*kg/);
  if (fino) {
    const max = parseItalianNumber(fino[1]!);
    if (max != null) return formatKgRange(null, max);
  }

  const superiore = lower.match(/(?:superior|maggi|oltre|>\s*)\s*(?:a\s+)?(\d+[.,]?\d*)\s*kg/);
  if (superiore) {
    const min = parseItalianNumber(superiore[1]!);
    if (min != null) return formatKgRange(min, null);
  }

  const inferiore = lower.match(/(?:inferior|meno\s+di|<\s*)\s*(\d+[.,]?\d*)\s*kg/);
  if (inferiore) {
    const max = parseItalianNumber(inferiore[1]!);
    if (max != null) return formatKgRange(null, max);
  }

  return null;
}

function extractRegimeMarkers(text: string, out: TokenAssignment[], seen: Set<string>): void {
  if (/\(\s*A\.I\.P\.\s*\)/i.test(text) || /\bA\.I\.P\.\b/i.test(text)) {
    pushUnique(out, seen, 'A.I.P.', 'Regime di prescrizione');
  }
}

function extractSizeBands(text: string, out: TokenAssignment[], seen: Set<string>): void {
  const lower = text.toLowerCase();
  if (!lower.includes('taglia')) return;

  if (/taglia\s+piccola\s*,?\s*media\s*,?\s*grande/i.test(lower)) {
    pushUnique(out, seen, 'cani', 'Target paziente / fascia di età');
    pushUnique(out, seen, 'taglie canine multiple', 'Fascia di peso');
    return;
  }

  for (const sz of ['piccola', 'media', 'grande', 'gigante', 'mini', 'maxi'] as const) {
    if (new RegExp(`taglia\\s+${sz}`, 'i').test(lower)) {
      pushUnique(out, seen, `taglia ${sz}`, 'Fascia di peso');
    }
  }
}

/** Decomposes the non-brand tail of a commercial catalog line. */
function decomposeBrandRemainder(text: string): DecomposeResult {
  const tokens: TokenAssignment[] = [];
  const seen = new Set<string>();

  const weight = parseWeightBand(text);
  if (weight) {
    pushUnique(tokens, seen, weight, 'Fascia di peso');
    if (/\bcani\b/i.test(text)) pushUnique(tokens, seen, 'cani', 'Target paziente / fascia di età');
    if (/\bgatti\b/i.test(text)) pushUnique(tokens, seen, 'gatti', 'Target paziente / fascia di età');
  }

  extractRegimeMarkers(text, tokens, seen);
  extractSizeBands(text, tokens, seen);

  const base = decomposePackagingPhrase(text);
  for (const t of base.tokens) pushUnique(tokens, seen, t.text, t.category);

  return { tokens, aliases: [] };
}

/**
 * Decomposes or normalizes a token destined for Nome commerciale.
 * Long catalog strings become brand + atomic attributes; pure brands stay as one token.
 */
export function purifyBrandSourceToken(text: string): DecomposeResult {
  const source = normalizePhrase(text);
  const tokens: TokenAssignment[] = [];
  const aliases: AliasAssignment[] = [];
  const seen = new Set<string>();

  if (isPureBrandName(source)) {
    const brand = normalizeBrandStem(source);
    if (normalizeKey(brand) !== normalizeKey(source)) {
      pushAlias(aliases, source, brand);
    }
    return { tokens: [{ text: brand, category: 'Nome commerciale' }], aliases };
  }

  let { brand, remainder } = extractBrandName(source);
  brand = normalizeBrandStem(brand);

  if (needsBrandDecomposition(brand)) {
    const nested = extractBrandName(brand);
    brand = normalizeBrandStem(nested.brand);
    remainder = [nested.remainder, remainder].filter(Boolean).join(' ');
  }

  pushUnique(tokens, seen, brand, 'Nome commerciale');

  if (remainder) {
    const extra = decomposeBrandRemainder(remainder);
    for (const t of extra.tokens) pushUnique(tokens, seen, t.text, t.category);
  }

  if (normalizeKey(source) !== normalizeKey(brand)) {
    pushAlias(aliases, source, brand);
  }

  return { tokens, aliases };
}

function extractContainers(text: string, out: TokenAssignment[], seen: Set<string>): void {
  const lower = text.toLowerCase();
  const ordered = Object.entries(CONTAINER_CANONICAL).sort((a, b) => b[0].length - a[0].length);
  for (const [word, canonical] of ordered) {
    const re = new RegExp(`\\b${word.replace('.', '\\.')}\\b`, 'i');
    if (re.test(lower)) {
      pushUnique(out, seen, canonical, 'Tipo contenitore');
      return;
    }
  }
}

function extractMaterials(text: string, out: TokenAssignment[], seen: Set<string>): void {
  const lower = text.toLowerCase();
  if (/\bvetro\s+tipo\s+[iiv]+/i.test(text)) {
    const m = text.match(/vetro\s+tipo\s+[iiv]+/i);
    if (m) pushUnique(out, seen, m[0].toLowerCase(), 'Materiale contenitore');
    return;
  }
  const ordered = Object.entries(MATERIAL_CANONICAL).sort((a, b) => b[0].length - a[0].length);
  for (const [word, canonical] of ordered) {
    const re = new RegExp(`\\b${word}\\b`, 'i');
    if (re.test(lower)) {
      pushUnique(out, seen, canonical, 'Materiale contenitore');
      return;
    }
  }
}

function extractGalenicForms(text: string, out: TokenAssignment[], seen: Set<string>): void {
  const lower = text.toLowerCase();
  for (const [en, it] of Object.entries({
    'palatable tablets': 'compresse appetibili',
    'palatable tablet': 'compresse appetibili',
    'chewable tablets': 'compresse masticabili',
    'chewable tablet': 'compresse masticabili',
    'film-coated tablets': 'compresse rivestite con film',
  })) {
    if (lower.includes(en)) {
      pushUnique(out, seen, it, 'Forma farmaceutica');
      return;
    }
  }
  const ordered = [...GALENIC_FORMS].sort((a, b) => b.length - a.length);
  for (const form of ordered) {
    if (lower.includes(form)) {
      pushUnique(out, seen, form, 'Forma farmaceutica');
      return;
    }
  }
}

function extractDosages(text: string, out: TokenAssignment[], seen: Set<string>): void {
  for (const match of text.matchAll(DOSAGE_VALUE_RE)) {
    const value = match[1]?.replace(',', '.');
    const unit = match[2]?.toUpperCase() ?? '';
    if (!value || !unit) continue;
    pushUnique(out, seen, `${value.replace('.', ',')} ${unit}`, 'Dosaggio / concentrazione');
  }
}

function extractQuantities(text: string, out: TokenAssignment[], seen: Set<string>): void {
  for (const match of text.matchAll(QUANTITY_RE)) {
    const num = parseItalianNumber(match[1] ?? '');
    let unit = (match[2] ?? '').toLowerCase();
    if (num == null || !unit) continue;
    if (unit.startsWith('lit')) unit = 'l';
    if (CONTAINER_CANONICAL[unit] || unit === 'blister' || unit === 'flacone') continue;
    pushUnique(out, seen, formatQuantity(num, unit), 'Quantità confezione');
  }
}

function extractSpecies(text: string, out: TokenAssignment[], seen: Set<string>): void {
  const lower = text.toLowerCase();
  for (const [word, canonical] of Object.entries(SPECIES_SHORT)) {
    const re = new RegExp(`\\bper\\s+${word}\\b|\\b${word}\\b`, 'i');
    if (re.test(lower)) pushUnique(out, seen, canonical, 'Target paziente / fascia di età');
  }
  const groups = [
    'animali da compagnia',
    'animali da reddito',
    'animali da cortile',
    'animali da laboratorio',
    'animali selvatici',
    'animali esotici',
    'cani e gatti',
    'bovini e suini',
  ];
  for (const g of groups) {
    if (lower.includes(g)) pushUnique(out, seen, g, 'Target paziente / fascia di età');
  }
}

function extractKitConfig(text: string, out: TokenAssignment[], seen: Set<string>): void {
  if (!text.includes('+')) return;
  const lower = text.toLowerCase();
  const hasLiofil = lower.includes('liofil');
  const hasSolv = lower.includes('solvent') || lower.includes('diluent');
  const hasAccessory = lower.includes('contagocc') || lower.includes('forchett') || lower.includes('siringa');
  if (hasLiofil && hasSolv && hasAccessory) {
    pushUnique(out, seen, 'liofilizzato + solvente + accessorio', 'Configurazione kit');
  } else if (hasLiofil && hasSolv) {
    pushUnique(out, seen, 'liofilizzato + solvente', 'Configurazione kit');
  } else if (hasLiofil) {
    pushUnique(out, seen, 'liofilizzato + componente', 'Configurazione kit');
  } else {
    pushUnique(out, seen, 'multicomponente', 'Configurazione kit');
  }
}

function extractModalities(text: string, out: TokenAssignment[], seen: Set<string>): void {
  const lower = text.toLowerCase();
  for (const [word, canonical] of Object.entries(MODALITY_CANONICAL)) {
    if (lower.includes(word)) pushUnique(out, seen, canonical, 'Modalità di somministrazione');
  }
}

/** Full decomposition for packaging / quantity monoliths. */
export function decomposePackagingPhrase(text: string): DecomposeResult {
  const tokens: TokenAssignment[] = [];
  const aliases: AliasAssignment[] = [];
  const seen = new Set<string>();

  extractContainers(text, tokens, seen);
  extractMaterials(text, tokens, seen);
  extractGalenicForms(text, tokens, seen);
  extractDosages(text, tokens, seen);
  extractQuantities(text, tokens, seen);
  extractSpecies(text, tokens, seen);
  extractKitConfig(text, tokens, seen);
  extractModalities(text, tokens, seen);

  if (tokens.length === 0) {
    pushUnique(tokens, seen, text, 'Quantità confezione');
  }

  return { tokens, aliases };
}

/** Refactors one token based on its source category. */
export function refactorToken(
  text: string,
  sourceCategory: SourceCategoryName,
): DecomposeResult {
  const source = normalizePhrase(text);
  const tokens: TokenAssignment[] = [];
  const aliases: AliasAssignment[] = [];
  const seen = new Set<string>();

  switch (sourceCategory) {
    case 'Nome commerciale':
      return purifyBrandSourceToken(source);
    case 'Principio attivo': {
      const doseMatch = DOSE_IN_PRINCIPIO_RE.exec(source);
      if (doseMatch) {
        const substance = normalizePhrase(source.slice(0, doseMatch.index));
        const dosePart = normalizePhrase(source.slice(doseMatch.index + 3));
        pushUnique(tokens, seen, substance, 'Principio attivo');
        pushUnique(tokens, seen, dosePart, 'Dosaggio / concentrazione');
        pushAlias(aliases, source, substance);
      } else {
        pushUnique(tokens, seen, source, 'Principio attivo');
      }
      break;
    }
    case 'Forma farmaceutica':
      return purifyGalenicSourceToken(source);
    case 'Forma di confezionamento':
    case 'Quantità confezione':
      return decomposePackagingPhrase(source);
    case 'Modalità di somministrazione': {
      const injectMatch = source.match(/^iniettabile\s+per\s+(.+)$/i);
      if (injectMatch) {
        pushUnique(tokens, seen, 'iniettabile', 'Modalità di somministrazione');
        pushUnique(tokens, seen, injectMatch[1]!.trim(), 'Target paziente / fascia di età');
        pushAlias(aliases, source, 'iniettabile');
        break;
      }
      const perMatch = source.match(/^per\s+(cani|gatti|bovini|suini|ovini|cavalli)(?:\s+e\s+\w+)?$/i);
      if (perMatch) {
        pushUnique(tokens, seen, source.replace(/^per\s+/i, ''), 'Target paziente / fascia di età');
        break;
      }
      if (REGIME_PHRASES.has(normalizeKey(source))) {
        pushUnique(tokens, seen, source, 'Regime di prescrizione');
        break;
      }
      if (normalizeKey(source) === 'masticabile' || normalizeKey(source) === 'masticabili') {
        pushUnique(tokens, seen, 'compresse masticabili', 'Forma farmaceutica');
        break;
      }
      pushUnique(tokens, seen, MODALITY_CANONICAL[normalizeKey(source)] ?? source, 'Modalità di somministrazione');
      break;
    }
    case 'Target paziente / fascia di età': {
      const weight = parseWeightBand(source);
      if (weight) {
        pushUnique(tokens, seen, weight, 'Fascia di peso');
        if (source.toLowerCase().includes('cani')) pushUnique(tokens, seen, 'cani', 'Target paziente / fascia di età');
        pushAlias(aliases, source, weight);
        break;
      }
      pushUnique(tokens, seen, source, 'Target paziente / fascia di età');
      break;
    }
    default:
      pushUnique(tokens, seen, source, sourceCategory as PharmaCategoryName);
  }

  return { tokens, aliases };
}

const GALENIC_EN_MAP: Record<string, string> = {
  'palatable tablets': 'compresse appetibili',
  'palatable tablet': 'compresse appetibili',
  'chewable tablets': 'compresse masticabili',
  'chewable tablet': 'compresse masticabili',
  chewable: 'compresse masticabili',
  'film-coated tablets': 'compresse rivestite con film',
  'spot on solution': 'soluzione',
};

const COMPOSITE_GALENIC_RE =
  /\d|(?:\bmg\b|\bml\b|\bg\b|\bkg\b)|palatable|tablets?|scatola|contenitore|siringh|flacon|blister|pipett|bustina|sacca|barattol|applicator|monodose da|\bda\s+\d|\bper\s+cani|\bper\s+gatti/i;

const TABLET_APPETIBILI_RE =
  /(\d+[.,]?\d*)\s*compresse?\s+appetibili(?:\s+da\s+(\d+[.,]?\d*)\s*mg)?/gi;

const TABLET_MASTICABILI_RE =
  /(\d+[.,]?\d*)\s*compresse?\s+masticabili(?:\s+da\s+(\d+[.,]?\d*)\s*mg)?/gi;

const MG_THEN_COUNT_RE = /(\d+[.,]?\d*)\s*mg\s*[-–]\s*(\d+[.,]?\d*)\s*compresse?\s+appetibili/i;

const PALATABLE_BLOCK_RE =
  /(\d+[.,]?\d*)\s*(?:mg\s*)?(?:[-–]\s*)?(\d+[.,]?\d*)\s*palatable\s+tablets?(?:\s*[-–]?\s*compresse?\s+appetibili)?/i;

/** Longest-match canonical galenic form, or null if not galenic-only text. */
export function canonicalGalenicForm(text: string): string | null {
  const lower = normalizePhrase(text).toLowerCase();
  for (const [en, it] of Object.entries(GALENIC_EN_MAP)) {
    if (lower.includes(en)) return it;
  }
  const ordered = [...GALENIC_FORMS].sort((a, b) => b.length - a.length);
  for (const form of ordered) {
    if (lower === form || lower === form.replace(/ /g, '')) return form;
  }
  for (const form of ordered) {
    if (lower.includes(form) && !COMPOSITE_GALENIC_RE.test(lower)) return form;
  }
  if (lower === 'masticabile' || lower === 'masticabili') return 'compresse masticabili';
  if (lower === 'chew') return 'compresse masticabili';
  return null;
}

export function needsGalenicDecomposition(text: string): boolean {
  const n = normalizePhrase(text);
  if (COMPOSITE_GALENIC_RE.test(n)) return true;
  return canonicalGalenicForm(n) === null;
}

/** Only orthographic variants belong as aliases of a galenic canonical (not decomposed catalog lines). */
export function isFormaFarmaceuticaSpellingAlias(phrase: string, canonical: string): boolean {
  if (needsGalenicDecomposition(phrase)) return false;
  const pure = canonicalGalenicForm(phrase);
  if (!pure || normalizeKey(pure) !== normalizeKey(canonical)) return false;
  const phraseWords = normalizeKey(phrase).split(/\s+/).filter(Boolean).length;
  const canonWords = normalizeKey(canonical).split(/\s+/).filter(Boolean).length;
  return phraseWords === canonWords;
}

/** Structured extract for tablet count + strength + galenic subtype. */
function extractTabletPhrases(text: string, out: TokenAssignment[], seen: Set<string>): boolean {
  let matched = false;
  const source = normalizePhrase(text);

  const mgThen = MG_THEN_COUNT_RE.exec(source);
  if (mgThen) {
    const count = parseItalianNumber(mgThen[2]!);
    const dose = parseItalianNumber(mgThen[1]!);
    pushUnique(out, seen, 'compresse appetibili', 'Forma farmaceutica');
    if (count != null) pushUnique(out, seen, formatQuantity(count, 'compresse'), 'Quantità confezione');
    if (dose != null) pushUnique(out, seen, `${String(dose).replace('.', ',')} mg`, 'Dosaggio / concentrazione');
    matched = true;
  }

  const palatable = PALATABLE_BLOCK_RE.exec(source);
  if (palatable && !mgThen) {
    const count = parseItalianNumber(palatable[2] ?? palatable[1] ?? '');
    pushUnique(out, seen, 'compresse appetibili', 'Forma farmaceutica');
    if (count != null) pushUnique(out, seen, formatQuantity(count, 'compresse'), 'Quantità confezione');
    matched = true;
  }

  for (const match of source.matchAll(TABLET_APPETIBILI_RE)) {
    const count = parseItalianNumber(match[1] ?? '');
    const dose = match[2] ? parseItalianNumber(match[2]) : null;
    pushUnique(out, seen, 'compresse appetibili', 'Forma farmaceutica');
    if (count != null) pushUnique(out, seen, formatQuantity(count, 'compresse'), 'Quantità confezione');
    if (dose != null) pushUnique(out, seen, `${String(dose).replace('.', ',')} mg`, 'Dosaggio / concentrazione');
    matched = true;
  }

  for (const match of source.matchAll(TABLET_MASTICABILI_RE)) {
    const count = parseItalianNumber(match[1] ?? '');
    const dose = match[2] ? parseItalianNumber(match[2]) : null;
    pushUnique(out, seen, 'compresse masticabili', 'Forma farmaceutica');
    if (count != null) pushUnique(out, seen, formatQuantity(count, 'compresse'), 'Quantità confezione');
    if (dose != null) pushUnique(out, seen, `${String(dose).replace('.', ',')} mg`, 'Dosaggio / concentrazione');
    matched = true;
  }

  return matched;
}

/**
 * Decomposes or normalizes a token destined for Forma farmaceutica.
 * Composite catalog strings become forma + quantità + dosaggio; pure forms stay as one token.
 */
export function purifyGalenicSourceToken(text: string): DecomposeResult {
  const source = normalizePhrase(text);
  const tokens: TokenAssignment[] = [];
  const seen = new Set<string>();
  const aliases: DecomposeResult['aliases'] = [];

  if (extractTabletPhrases(source, tokens, seen)) {
    return { tokens, aliases: [] };
  }

  const pure = canonicalGalenicForm(source);
  if (pure && !needsGalenicDecomposition(source)) {
    if (normalizeKey(pure) !== normalizeKey(source)) {
      aliases.push({ phrase: source, canonical: pure });
    }
    return { tokens: [{ text: pure, category: 'Forma farmaceutica' }], aliases };
  }

  const decomposed = decomposePackagingPhrase(source);
  if (decomposed.tokens.length > 0) {
    const hasForma = decomposed.tokens.some((t) => t.category === 'Forma farmaceutica');
    if (!hasForma) {
      const fallback = canonicalGalenicForm(source);
      if (fallback) {
        pushUnique(
          decomposed.tokens,
          new Set(decomposed.tokens.map((t) => `${t.category}::${normalizeKey(t.text)}`)),
          fallback,
          'Forma farmaceutica',
        );
      }
    }
    return {
      tokens: decomposed.tokens,
      aliases: [],
    };
  }

  if (pure) {
    return { tokens: [{ text: pure, category: 'Forma farmaceutica' }], aliases };
  }

  return { tokens: [], aliases: [] };
}

/** Re-processes all Forma farmaceutica assignments after initial refactor pass. */
export function postProcessFormaFarmaceutica(
  tokenCategory: Record<string, PharmaCategoryName>,
): { aliases: DecomposeResult['aliases']; removed: number; split: number } {
  const aliases: DecomposeResult['aliases'] = [];
  const toFix = Object.entries(tokenCategory).filter(([, cat]) => cat === 'Forma farmaceutica');
  let removed = 0;
  let split = 0;

  for (const [text] of toFix) {
    if (!needsGalenicDecomposition(text) && canonicalGalenicForm(text)) continue;

    const result = purifyGalenicSourceToken(text);
    delete tokenCategory[text];
    removed += 1;

    if (result.tokens.length === 0) continue;
    split += 1;
    for (const t of result.tokens) {
      tokenCategory[t.text] = t.category;
    }
    aliases.push(...result.aliases);
  }

  return { aliases, removed, split };
}

/** Re-processes all Nome commerciale assignments after initial refactor pass. */
export function postProcessNomeCommerciale(
  tokenCategory: Record<string, PharmaCategoryName>,
): { aliases: DecomposeResult['aliases']; removed: number; split: number } {
  const aliases: DecomposeResult['aliases'] = [];
  const toFix = Object.entries(tokenCategory).filter(([, cat]) => cat === 'Nome commerciale');
  let removed = 0;
  let split = 0;

  for (const [text] of toFix) {
    if (isPureBrandName(text)) {
      const stem = normalizeBrandStem(text);
      if (normalizeKey(stem) !== normalizeKey(text)) {
        delete tokenCategory[text];
        tokenCategory[stem] = 'Nome commerciale';
        aliases.push({ phrase: text, canonical: stem });
        removed += 1;
      }
      continue;
    }

    const result = purifyBrandSourceToken(text);
    delete tokenCategory[text];
    removed += 1;

    if (result.tokens.length === 0) continue;
    split += 1;
    for (const t of result.tokens) {
      tokenCategory[t.text] = t.category;
    }
    aliases.push(...result.aliases);
  }

  return { aliases, removed, split };
}
