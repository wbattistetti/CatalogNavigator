/**
 * Pharmaceutical dictionary category icons (Italian AIFA-style vocabulary).
 */
import { CATEGORY_COLOR } from './categoryIconColors';
import type { CategoryIconSpec } from './healthcareIconCatalogData';

function spec(iconKey: string, iconColor: string): CategoryIconSpec {
  return { iconKey, iconColor };
}

/** Exact category names for the Farmaci library dictionary. */
export const PHARMA_EXACT_CATEGORY_ICONS: Record<string, CategoryIconSpec> = {
  'principio attivo': spec('FlaskConical', CATEGORY_COLOR.lab),
  'nome commerciale': spec('Tag', CATEGORY_COLOR.drug),
  'classe terapeutica': spec('Layers', CATEGORY_COLOR.specialty),
  'forma farmaceutica': spec('Pill', CATEGORY_COLOR.drug),
  'forma di confezionamento': spec('Package', CATEGORY_COLOR.anatomy),
  'dosaggio / concentrazione': spec('Scale', CATEGORY_COLOR.exam),
  'quantita confezione': spec('Boxes', CATEGORY_COLOR.visitType),
  'indicazione clinica': spec('FileText', CATEGORY_COLOR.diagnosis),
  'vincoli / controindicazioni': spec('ShieldAlert', CATEGORY_COLOR.constraint),
  'modalita di somministrazione': spec('Syringe', CATEGORY_COLOR.procedure),
  'regime di prescrizione': spec('FileBadge', CATEGORY_COLOR.age),
  'target paziente / fascia di eta': spec('AgeGrowth', CATEGORY_COLOR.age),
  'indicazioni regolatorie': spec('Landmark', CATEGORY_COLOR.service),
  'stabilita e conservazione': spec('Snowflake', CATEGORY_COLOR.lab),
  'via di eliminazione / metabolismo': spec('Droplet', CATEGORY_COLOR.organ),
  'interazioni farmacologiche rilevanti': spec('Link2', CATEGORY_COLOR.mental),
};

/** Keyword fallback for pharma-related category names. */
export const PHARMA_CATEGORY_KEYWORD_RULES: Array<{ keywords: string[]; spec: CategoryIconSpec }> = [
  { keywords: ['principio attivo', 'molecola', 'api'], spec: spec('FlaskConical', CATEGORY_COLOR.lab) },
  { keywords: ['nome commerciale', 'brand'], spec: spec('Tag', CATEGORY_COLOR.drug) },
  { keywords: ['classe terapeutica', 'atc'], spec: spec('Layers', CATEGORY_COLOR.specialty) },
  { keywords: ['forma farmaceutica', 'galenica'], spec: spec('Pill', CATEGORY_COLOR.drug) },
  { keywords: ['confezionamento', 'blister', 'flacone', 'bustine'], spec: spec('Package', CATEGORY_COLOR.anatomy) },
  { keywords: ['dosaggio', 'concentrazione', 'mg', 'ml'], spec: spec('Scale', CATEGORY_COLOR.exam) },
  { keywords: ['quantita confezione', 'compresse'], spec: spec('Boxes', CATEGORY_COLOR.visitType) },
  { keywords: ['indicazione clinica', 'indicazioni terapeutiche'], spec: spec('FileText', CATEGORY_COLOR.diagnosis) },
  { keywords: ['controindicaz', 'vincoli', 'gravidanza', 'allergie'], spec: spec('ShieldAlert', CATEGORY_COLOR.constraint) },
  { keywords: ['somministrazione', 'orale', 'endovenosa', 'topica'], spec: spec('Syringe', CATEGORY_COLOR.procedure) },
  { keywords: ['regime di prescrizione', 'otc', 'stupefacente'], spec: spec('FileBadge', CATEGORY_COLOR.age) },
  { keywords: ['target paziente', 'fascia di eta', 'pediatrico', 'geriatrico'], spec: spec('AgeGrowth', CATEGORY_COLOR.age) },
  { keywords: ['regolatorie', 'generico', 'biosimilare'], spec: spec('Landmark', CATEGORY_COLOR.service) },
  { keywords: ['conservazione', 'refrigerat', 'stabilita'], spec: spec('Snowflake', CATEGORY_COLOR.lab) },
  { keywords: ['eliminazione', 'metabolismo', 'renale', 'epatica'], spec: spec('Droplet', CATEGORY_COLOR.organ) },
  { keywords: ['interazioni farmacologiche', 'interazione'], spec: spec('Link2', CATEGORY_COLOR.mental) },
];
