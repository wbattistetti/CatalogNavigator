/**
 * Pre-built category/token icon catalog (Italian healthcare and general domains).
 * Each category has a distinct accent color stored once at creation.
 */
import type { TokenCategory } from './dictionaryTree';
import type { LoadedDictionaryRef } from './multiDictionarySegment';
import { findDictionaryForToken } from './multiDictionarySegment';
import { DEFAULT_LUCIDE_ICON_KEY } from './lucideIconRegistry';

export interface CategoryIconSpec {
  iconKey: string;
  iconColor: string;
}

/** Glossy-console palette — one hue per semantic family. */
export const CATEGORY_COLOR = {
  specialty: '#a78bfa',
  visitType: '#38bdf8',
  visit: '#fb7185',
  exam: '#22d3ee',
  age: '#fcd34d',
  diagnosis: '#86efac',
  symptom: '#f87171',
  drug: '#c084fc',
  service: '#4ade80',
  location: '#60a5fa',
  urgency: '#ef4444',
  gender: '#e879f9',
  staff: '#94a3b8',
  imaging: '#67e8f9',
  lab: '#2dd4bf',
  mental: '#d8b4fe',
  default: '#f59e0b',
  noCategory: '#34d399',
  library: '#38bdf8',
} as const;

/** @deprecated Use CATEGORY_COLOR.default */
export const PROJECT_CATEGORY_ICON_COLOR = CATEGORY_COLOR.default;

export const LIBRARY_CHIP_ICON_COLOR = CATEGORY_COLOR.library;

export const NO_CATEGORY_ICON: CategoryIconSpec = {
  iconKey: 'Folder',
  iconColor: CATEGORY_COLOR.noCategory,
};

const DEFAULT_CATEGORY_ICON: CategoryIconSpec = {
  iconKey: DEFAULT_LUCIDE_ICON_KEY,
  iconColor: CATEGORY_COLOR.default,
};

function spec(iconKey: string, iconColor: string): CategoryIconSpec {
  return { iconKey, iconColor };
}

/** Exact normalized name → icon + accent color. */
const EXACT_CATEGORY_ICONS: Record<string, CategoryIconSpec> = {
  'specialita': spec('Building2', CATEGORY_COLOR.specialty),
  'specialità': spec('Building2', CATEGORY_COLOR.specialty),
  'tipo visita': spec('ClipboardList', CATEGORY_COLOR.visitType),
  'visita': spec('Stethoscope', CATEGORY_COLOR.visit),
  'visite': spec('Stethoscope', CATEGORY_COLOR.visit),
  'esame': spec('FlaskConical', CATEGORY_COLOR.exam),
  'esami': spec('FlaskConical', CATEGORY_COLOR.exam),
  'fascia di eta': spec('Users', CATEGORY_COLOR.age),
  'fascia di età': spec('Users', CATEGORY_COLOR.age),
  'fasce di eta': spec('Users', CATEGORY_COLOR.age),
  'fasce di età': spec('Users', CATEGORY_COLOR.age),
  'diagnosi': spec('FileText', CATEGORY_COLOR.diagnosis),
  'sintomo': spec('Thermometer', CATEGORY_COLOR.symptom),
  'sintomi': spec('Thermometer', CATEGORY_COLOR.symptom),
  'farmaco': spec('Pill', CATEGORY_COLOR.drug),
  'farmaci': spec('Pill', CATEGORY_COLOR.drug),
  'terapia': spec('Pill', CATEGORY_COLOR.drug),
  'prestazione': spec('ClipboardCheck', CATEGORY_COLOR.service),
  'prestazioni': spec('ClipboardCheck', CATEGORY_COLOR.service),
  'sede': spec('MapPin', CATEGORY_COLOR.location),
  'struttura': spec('Building2', CATEGORY_COLOR.location),
  'priorita': spec('AlertTriangle', CATEGORY_COLOR.urgency),
  'priorità': spec('AlertTriangle', CATEGORY_COLOR.urgency),
  'urgenza': spec('AlertTriangle', CATEGORY_COLOR.urgency),
  'sesso': spec('UserRound', CATEGORY_COLOR.gender),
  'genere': spec('UserRound', CATEGORY_COLOR.gender),
  'medico': spec('User', CATEGORY_COLOR.staff),
  'operatore': spec('User', CATEGORY_COLOR.staff),
};

/** Keyword contained in normalized label → icon + color. */
const KEYWORD_ICON_RULES: Array<{ keywords: string[]; spec: CategoryIconSpec }> = [
  { keywords: ['prima visita', 'nuova visita', 'ingresso'], spec: spec('CalendarPlus', CATEGORY_COLOR.visitType) },
  { keywords: ['controllo', 'follow up', 'follow-up', 'rivalutazione', 'richiamo'], spec: spec('RefreshCw', CATEGORY_COLOR.visitType) },
  { keywords: ['teleconsulto', 'televisita', 'videochiamata'], spec: spec('Video', CATEGORY_COLOR.visitType) },
  { keywords: ['telefon'], spec: spec('Phone', CATEGORY_COLOR.visitType) },
  { keywords: ['cardiolog', 'cuore', 'ecg', 'elettrocardiogramma'], spec: spec('HeartPulse', CATEGORY_COLOR.symptom) },
  { keywords: ['neurolog', 'encefal'], spec: spec('Brain', CATEGORY_COLOR.specialty) },
  { keywords: ['ortoped', 'traumatolog', 'osso', 'frattura'], spec: spec('Bone', CATEGORY_COLOR.specialty) },
  { keywords: ['pediatr', 'neonat', 'bambin'], spec: spec('Baby', CATEGORY_COLOR.age) },
  { keywords: ['oculist', 'oftalmolog', 'vista'], spec: spec('Eye', CATEGORY_COLOR.specialty) },
  { keywords: ['otorin', 'orecchio', 'udito'], spec: spec('Ear', CATEGORY_COLOR.specialty) },
  { keywords: ['pneumolog', 'polmon', 'spirometr'], spec: spec('Wind', CATEGORY_COLOR.specialty) },
  { keywords: ['psicolog', 'psichiatr'], spec: spec('MessageCircle', CATEGORY_COLOR.mental) },
  { keywords: ['radiolog', 'radiograf', 'rx', 'tac', 'risonanza', 'rmn', 'tomograf'], spec: spec('Scan', CATEGORY_COLOR.imaging) },
  { keywords: ['ecograf', 'ultrasuon'], spec: spec('Waves', CATEGORY_COLOR.imaging) },
  { keywords: ['laborator', 'emocrom', 'sangue', 'emoglob', 'glicem', 'colesterol'], spec: spec('Droplet', CATEGORY_COLOR.lab) },
  { keywords: ['urin', 'urina'], spec: spec('TestTube2', CATEGORY_COLOR.lab) },
  { keywords: ['biops', 'citolog'], spec: spec('Syringe', CATEGORY_COLOR.exam) },
  { keywords: ['microscop', 'coltura', 'batteri'], spec: spec('Microscope', CATEGORY_COLOR.lab) },
  { keywords: ['provetta', 'analisi'], spec: spec('FlaskConical', CATEGORY_COLOR.exam) },
  { keywords: ['visita', 'ambulator'], spec: spec('Stethoscope', CATEGORY_COLOR.visit) },
  { keywords: ['0-17', '0 17', 'minoren', 'infanzia'], spec: spec('Baby', CATEGORY_COLOR.age) },
  { keywords: ['18-39', '18 39', 'giovane adult'], spec: spec('User', CATEGORY_COLOR.age) },
  { keywords: ['40-64', '40 64', 'mezza eta', 'mezza età'], spec: spec('UserRound', CATEGORY_COLOR.age) },
  { keywords: ['65', 'anzian', 'geriatr', 'over 65'], spec: spec('PersonStanding', CATEGORY_COLOR.age) },
  { keywords: ['fascia', 'eta', 'età', 'anni'], spec: spec('Users', CATEGORY_COLOR.age) },
  { keywords: ['special', 'branca', 'disciplina'], spec: spec('Building2', CATEGORY_COLOR.specialty) },
  { keywords: ['diagnos'], spec: spec('FileText', CATEGORY_COLOR.diagnosis) },
  { keywords: ['sintom', 'dolore', 'febbre'], spec: spec('Thermometer', CATEGORY_COLOR.symptom) },
  { keywords: ['farmaco', 'terapia', 'pillola'], spec: spec('Pill', CATEGORY_COLOR.drug) },
  { keywords: ['prestaz', 'servizio'], spec: spec('ClipboardCheck', CATEGORY_COLOR.service) },
  { keywords: ['ospedal', 'clinica', 'sede', 'struttura'], spec: spec('MapPin', CATEGORY_COLOR.location) },
  { keywords: ['urgen', 'emergenz', 'priorit'], spec: spec('AlertTriangle', CATEGORY_COLOR.urgency) },
  { keywords: ['oncolog', 'tumor'], spec: spec('Radiation', CATEGORY_COLOR.imaging) },
  { keywords: ['dermatolog', 'pelle'], spec: spec('ScanSearch', CATEGORY_COLOR.specialty) },
  { keywords: ['endoscop'], spec: spec('SearchCheck', CATEGORY_COLOR.exam) },
  { keywords: ['attivita', 'attività', 'monitor'], spec: spec('Activity', CATEGORY_COLOR.symptom) },
  { keywords: ['apertura', 'accoglienza'], spec: spec('DoorOpen', CATEGORY_COLOR.visitType) },
  { keywords: ['nuovo', 'nuova'], spec: spec('Sparkles', CATEGORY_COLOR.visitType) },
  { keywords: ['ripet', 'ciclo'], spec: spec('Repeat', CATEGORY_COLOR.visitType) },
  { keywords: ['calendario', 'appuntament'], spec: spec('Calendar', CATEGORY_COLOR.visitType) },
  { keywords: ['conferm', 'completat'], spec: spec('CheckCircle', CATEGORY_COLOR.service) },
  { keywords: ['cerca', 'ricerca'], spec: spec('FileSearch', CATEGORY_COLOR.diagnosis) },
];

export interface ChipSurfaceStyle {
  backgroundColor: string;
  borderColor: string;
  color: string;
}

/** Chip background/border/text tints from category accent hex. */
export function chipSurfaceStyleFromColor(hex: string, alphaBg = 0.14, alphaBorder = 0.42): ChipSurfaceStyle {
  return {
    backgroundColor: `${hex}${Math.round(alphaBg * 255).toString(16).padStart(2, '0')}`,
    borderColor: `${hex}${Math.round(alphaBorder * 255).toString(16).padStart(2, '0')}`,
    color: hex,
  };
}

/** Normalizes labels for catalog lookup (lowercase, trim, collapse spaces, strip accents). */
export function normalizeIconLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

function lookupByKeyword(normalized: string): CategoryIconSpec | null {
  for (const rule of KEYWORD_ICON_RULES) {
    if (rule.keywords.some((kw) => normalized.includes(normalizeIconLabel(kw)))) {
      return rule.spec;
    }
  }
  return null;
}

/** Resolves icon + accent color for a category name (exact match, then keyword rules). */
export function resolveCategoryIcon(categoryName: string): CategoryIconSpec {
  const normalized = normalizeIconLabel(categoryName);
  if (!normalized) return DEFAULT_CATEGORY_ICON;
  return EXACT_CATEGORY_ICONS[normalized]
    ?? lookupByKeyword(normalized)
    ?? DEFAULT_CATEGORY_ICON;
}

/** Returns stored icon on category or resolves from its name. */
export function iconForCategory(category: Pick<TokenCategory, 'name' | 'iconKey' | 'iconColor'>): CategoryIconSpec {
  if (category.iconKey && category.iconColor) {
    return { iconKey: category.iconKey, iconColor: category.iconColor };
  }
  if (category.iconKey) {
    return {
      iconKey: category.iconKey,
      iconColor: resolveCategoryIcon(category.name).iconColor,
    };
  }
  return resolveCategoryIcon(category.name);
}

function categoryIdContainingToken(tokenText: string, categories: TokenCategory[]): string | null {
  for (const cat of categories) {
    if (cat.tokenTexts.includes(tokenText)) return cat.id;
  }
  return null;
}

/** Category display name for a token, or "no category" when at dictionary root. */
export function categoryNameForToken(tokenText: string, categories: TokenCategory[]): string {
  const categoryId = categoryIdContainingToken(tokenText, categories);
  if (!categoryId) return 'no category';
  return categories.find((c) => c.id === categoryId)?.name ?? 'no category';
}

/** Tooltip label: "Project - esami" / "LibraryName - specialità". */
export function formatChipTooltipTitle(
  scope: ChipDictionaryScope,
  dictionaryName: string | undefined,
  categoryName: string,
): string {
  const dictLabel = scope === 'project' ? 'Project' : (dictionaryName?.trim() || 'Library');
  return `${dictLabel} - ${categoryName}`;
}

/** Icon for a token: parent category icon, or the shared "no category" bucket icon. */
export function resolveTokenIcon(
  categories: TokenCategory[],
  tokenText: string,
): CategoryIconSpec {
  const categoryId = categoryIdContainingToken(tokenText, categories);
  if (categoryId) {
    const cat = categories.find((c) => c.id === categoryId);
    if (cat) return iconForCategory(cat);
  }
  return NO_CATEGORY_ICON;
}

/** Syncs icon + accent color from catalog (refreshes on load so palette updates apply). */
export function enrichCategoryIcons(category: TokenCategory): TokenCategory {
  const spec = resolveCategoryIcon(category.name);
  return {
    ...category,
    iconKey: spec.iconKey,
    iconColor: spec.iconColor,
  };
}

export type ChipDictionaryScope = 'project' | 'library';

export interface ChipAppearance {
  iconKey: string;
  iconColor: string;
  categoryColor: string;
  scope: ChipDictionaryScope;
  title: string;
}

/** Chip icon + category accent for corpus segmentation and highlights. */
export function resolveChipAppearance(
  tokenText: string,
  loadedRefs: LoadedDictionaryRef[],
  editingDictionaryId: string | null | undefined,
  editingCategories: TokenCategory[],
): ChipAppearance {
  let dictionaryId = editingDictionaryId
    && loadedRefs.some((r) => r.dictionary.id === editingDictionaryId
      && r.dictionary.tokens.some((t) => t.text === tokenText && !t.aliasOf))
    ? editingDictionaryId
    : findDictionaryForToken(tokenText, loadedRefs);

  const ref = dictionaryId
    ? loadedRefs.find((r) => r.dictionary.id === dictionaryId)
    : loadedRefs[0];

  const dict = ref?.dictionary;
  const scope: ChipDictionaryScope = dict?.scope === 'project' ? 'project' : 'library';
  const categories = dict?.categories ?? editingCategories;
  const categoryName = categoryNameForToken(tokenText, categories);
  const icon = resolveTokenIcon(categories, tokenText);
  const categoryColor = icon.iconColor;

  return {
    iconKey: icon.iconKey,
    iconColor: categoryColor,
    categoryColor,
    scope,
    title: formatChipTooltipTitle(scope, dict?.name, categoryName),
  };
}
