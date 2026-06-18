/**
 * Design-time resolution pipeline for vincolo categories (executed by VB ResolutionRunner v1).
 */
import type { TokenCategory } from './dictionaryTree';
import { isAgeVincoloCategoryName } from './vincoloResolutionGrammar';

/** Supported age units — must stay in sync with VB AgeUnitConverter. */
export type AgeUnit = 'years' | 'months' | 'weeks' | 'days';

export interface ResolvedQuantity {
  value: number;
  unit: AgeUnit;
}

export interface RegexCaptureStep {
  type: 'regex_capture';
  pattern: string;
  valueGroup: number;
  unitGroup?: number;
  unitMap?: Record<string, AgeUnit>;
  defaultUnit?: AgeUnit;
}

export interface WordUnitCaptureStep {
  type: 'word_unit_capture';
  pattern: string;
  wordGroup: number;
  unitGroup?: number;
  wordValueMap: Record<string, number>;
  unitMap?: Record<string, AgeUnit>;
  defaultUnit?: AgeUnit;
}

export interface WordMapEntry {
  word: string;
  value: number;
  unit: AgeUnit;
}

export interface WordMapStep {
  type: 'word_map';
  entries: WordMapEntry[];
}

export interface BareNumberStep {
  type: 'bare_number';
  pattern: string;
  defaultUnit: AgeUnit;
}

export type ResolutionStep =
  | RegexCaptureStep
  | WordUnitCaptureStep
  | WordMapStep
  | BareNumberStep;

/** Contract stored on vincolo categories and sent to VB.NET. */
export interface VincoloResolutionPipeline {
  engine: 'pipeline';
  version: 1;
  valueKind: 'age_years';
  steps: ResolutionStep[];
}

const ITALIAN_ONES: Readonly<Record<string, number>> = {
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
};

const ITALIAN_TEENS: Readonly<Record<string, number>> = {
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
};

const ITALIAN_TENS: Readonly<Record<string, number>> = {
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

const UNIT_MAP: Record<string, AgeUnit> = {
  anno: 'years',
  anni: 'years',
  mese: 'months',
  mesi: 'months',
  settimana: 'weeks',
  settimane: 'weeks',
  giorno: 'days',
  giorni: 'days',
};

const TENS_PREFIXES = [
  { word: 'venti', base: 20 },
  { word: 'trenta', base: 30 },
  { word: 'quaranta', base: 40 },
  { word: 'cinquanta', base: 50 },
  { word: 'sessanta', base: 60 },
  { word: 'settenta', base: 70 },
  { word: 'ottanta', base: 80 },
  { word: 'novanta', base: 90 },
] as const;

const ONES_SUFFIXES = [
  { word: 'uno', value: 1 },
  { word: 'due', value: 2 },
  { word: 'tre', value: 3 },
  { word: 'quattro', value: 4 },
  { word: 'cinque', value: 5 },
  { word: 'sei', value: 6 },
  { word: 'sette', value: 7 },
  { word: 'otto', value: 8 },
  { word: 'nove', value: 9 },
] as const;

/** Builds Italian compound age word (ventuno, trentatré, ventidue…). */
function buildItalianCompoundWord(tensWord: string, onesWord: string): string {
  if (tensWord === 'venti') {
    if (onesWord === 'uno') return 'ventuno';
    if (onesWord === 'otto') return 'ventotto';
    if (onesWord === 'tre') return 'ventitré';
    return `${tensWord}${onesWord}`;
  }
  if (tensWord.endsWith('a')) {
    const stem = tensWord.slice(0, -1);
    if (onesWord === 'uno') return `${stem}uno`;
    if (onesWord === 'otto') return `${stem}otto`;
    if (onesWord === 'tre') return `${stem}atré`;
    return `${tensWord}${onesWord}`;
  }
  return `${tensWord}${onesWord}`;
}

/** Builds Italian age word lexicon: 0–19, tens, 21–99 compounds, cento. */
export function buildItalianAgeWordLexicon(): Record<string, number> {
  const lexicon: Record<string, number> = {
    ...ITALIAN_ONES,
    ...ITALIAN_TEENS,
    ...ITALIAN_TENS,
  };

  for (const tens of TENS_PREFIXES) {
    for (const ones of ONES_SUFFIXES) {
      const word = buildItalianCompoundWord(tens.word, ones.word);
      lexicon[word] = tens.base + ones.value;
      if (ones.word === 'tre') {
        lexicon[word.normalize('NFD').replace(/\p{M}/gu, '')] = tens.base + ones.value;
      }
    }
  }

  return lexicon;
}

/** Normalizes Italian age utterances (apostrophes, accents) before pipeline execution. */
export function normalizeAgeUtterance(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .replace(/vent'\s*anni/g, 'venti anni')
    .replace(/vent'anni/g, 'venti anni')
    .replace(/(\w)'(\w)/g, '$1$2')
    .replace(/\bvent'\b/g, 'venti')
    .trim();
}

function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Longest-first alternation with word boundaries on each age word. */
export function buildAgeWordAlternation(lexicon: Record<string, number>): string {
  return Object.keys(lexicon)
    .sort((a, b) => b.length - a.length)
    .map((word) => String.raw`\b${escapeRegexLiteral(word)}\b`)
    .join('|');
}

const UNIT_ALT = 'anni|anno|mesi|mese|giorni|giorno|settimane|settimana';
const VERB_PREFIX = String.raw`(?:ho|ha|sono|è|e|di)\s+`;

/** Builds pipeline v1 for age vincolo categories. */
export function compileAgeVincoloResolutionPipeline(): VincoloResolutionPipeline {
  const lexicon = buildItalianAgeWordLexicon();
  const wordAlt = buildAgeWordAlternation(lexicon);
  const wordEntries: WordMapEntry[] = Object.entries(lexicon).map(([word, value]) => ({
    word,
    value,
    unit: 'years' as const,
  }));

  return {
    engine: 'pipeline',
    version: 1,
    valueKind: 'age_years',
    steps: [
      {
        type: 'regex_capture',
        pattern: String.raw`(?:^|\s)(\d{1,3})\s*(${UNIT_ALT})\b`,
        valueGroup: 1,
        unitGroup: 2,
        unitMap: UNIT_MAP,
      },
      {
        type: 'regex_capture',
        pattern: String.raw`${VERB_PREFIX}(\d{1,3})(?:\s*(${UNIT_ALT}))?\b`,
        valueGroup: 1,
        unitGroup: 2,
        unitMap: UNIT_MAP,
        defaultUnit: 'years',
      },
      {
        type: 'word_unit_capture',
        pattern: String.raw`(?:^|\s|${VERB_PREFIX})(${wordAlt})(?:\s*(${UNIT_ALT}))?\b`,
        wordGroup: 1,
        unitGroup: 2,
        wordValueMap: lexicon,
        unitMap: UNIT_MAP,
        defaultUnit: 'years',
      },
      {
        type: 'word_map',
        entries: wordEntries,
      },
      {
        type: 'bare_number',
        pattern: String.raw`^\d{1,3}$`,
        defaultUnit: 'years',
      },
    ],
  };
}

/** Builds resolution pipeline for a vincolo category. */
export function compileVincoloResolutionPipeline(
  category: TokenCategory,
): VincoloResolutionPipeline | null {
  if (category.type !== 'vincolo') return null;
  if (!isAgeVincoloCategoryName(category.name)) return null;
  return compileAgeVincoloResolutionPipeline();
}

const SUPPORTED_STEP_TYPES = new Set([
  'regex_capture',
  'word_unit_capture',
  'word_map',
  'bare_number',
]);

function validateRegexPattern(pattern: string): string | null {
  if (!pattern?.trim()) return 'pattern is required';
  try {
    // eslint-disable-next-line no-new
    new RegExp(pattern, 'i');
    return null;
  } catch (e) {
    return `invalid regex: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/** Validates pipeline before publish / bundle conversion. */
export function validateResolutionPipeline(pipeline: VincoloResolutionPipeline): string | null {
  if (pipeline.engine !== 'pipeline') return 'resolution.engine must be "pipeline"';
  if (pipeline.version !== 1) return `unsupported resolution.version ${pipeline.version}`;
  if (pipeline.valueKind !== 'age_years') return `unsupported valueKind ${pipeline.valueKind}`;
  if (!pipeline.steps?.length) return 'resolution.steps is empty';

  for (const step of pipeline.steps) {
    if (!SUPPORTED_STEP_TYPES.has(step.type)) {
      return `unsupported step.type ${step.type}`;
    }
    if (step.type === 'regex_capture') {
      if (!Number.isInteger(step.valueGroup) || step.valueGroup < 0) {
        return 'regex_capture.valueGroup invalid';
      }
      const regexError = validateRegexPattern(step.pattern);
      if (regexError) return `regex_capture.${regexError}`;
    }
    if (step.type === 'word_unit_capture') {
      if (!Number.isInteger(step.wordGroup) || step.wordGroup < 1) {
        return 'word_unit_capture.wordGroup invalid';
      }
      if (!step.wordValueMap || Object.keys(step.wordValueMap).length === 0) {
        return 'word_unit_capture.wordValueMap is empty';
      }
      const regexError = validateRegexPattern(step.pattern);
      if (regexError) return `word_unit_capture.${regexError}`;
    }
    if (step.type === 'word_map' && (!step.entries?.length)) {
      return 'word_map.entries is empty';
    }
    if (step.type === 'bare_number') {
      const regexError = validateRegexPattern(step.pattern);
      if (regexError) return `bare_number.${regexError}`;
    }
  }
  return null;
}

function resolveUnitFromMatch(
  unitToken: string,
  unitMap: Record<string, AgeUnit> | undefined,
  defaultUnit: AgeUnit,
): AgeUnit {
  const token = unitToken.trim().toLowerCase();
  if (token && unitMap?.[token]) return unitMap[token];
  return defaultUnit;
}

function lookupWordValue(rawWord: string, wordValueMap: Record<string, number>): number | null {
  const normalized = rawWord.trim().toLowerCase().replace(/'/g, '');
  if (!normalized) return null;
  const value = wordValueMap[normalized];
  return Number.isFinite(value) ? value : null;
}

/** Test helper: run pipeline in TS for unit tests (mirrors VB semantics). */
export function runResolutionPipelineForTest(
  pipeline: VincoloResolutionPipeline,
  text: string,
): ResolvedQuantity | null {
  const normalized = normalizeAgeUtterance(text);
  if (!normalized) return null;

  for (const step of pipeline.steps) {
    if (step.type === 'regex_capture') {
      const match = normalized.match(new RegExp(step.pattern, 'i'));
      if (!match) continue;
      const rawValue = step.valueGroup > 0 ? match[step.valueGroup] : match[0];
      const value = Number.parseInt(rawValue ?? '', 10);
      if (!Number.isFinite(value) || value < 0 || value > 120) continue;
      const unitToken = step.unitGroup != null && step.unitGroup > 0
        ? (match[step.unitGroup] ?? '')
        : '';
      const unit = resolveUnitFromMatch(unitToken, step.unitMap, step.defaultUnit ?? 'years');
      return { value, unit };
    }
    if (step.type === 'word_unit_capture') {
      const match = normalized.match(new RegExp(step.pattern, 'i'));
      if (!match) continue;
      const rawWord = match[step.wordGroup] ?? '';
      const value = lookupWordValue(rawWord, step.wordValueMap);
      if (value == null || value < 0 || value > 120) continue;
      const unitToken = step.unitGroup != null && step.unitGroup > 0
        ? (match[step.unitGroup] ?? '')
        : '';
      const unit = resolveUnitFromMatch(unitToken, step.unitMap, step.defaultUnit ?? 'years');
      return { value, unit };
    }
    if (step.type === 'word_map') {
      const sorted = [...step.entries].sort((a, b) => b.word.length - a.word.length);
      for (const entry of sorted) {
        const re = new RegExp(String.raw`\b${entry.word.replace(/'/g, '')}\b`, 'i');
        if (re.test(normalized)) return { value: entry.value, unit: entry.unit };
      }
    }
    if (step.type === 'bare_number') {
      if (new RegExp(step.pattern, 'i').test(normalized)) {
        const value = Number.parseInt(normalized, 10);
        if (Number.isFinite(value) && value >= 0 && value <= 120) {
          return { value, unit: step.defaultUnit };
        }
      }
    }
  }
  return null;
}
