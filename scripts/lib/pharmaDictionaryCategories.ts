/**
 * Category definitions for the Farmaci library dictionary (pharma CSV import).
 */
export const PHARMA_DICTIONARY_NAME = 'Farmaci';

export const PHARMA_CATEGORY_NAMES = [
  'Principio attivo',
  'Nome commerciale',
  'Classe terapeutica',
  'Forma farmaceutica',
  'Tipo contenitore',
  'Materiale contenitore',
  'Configurazione kit',
  'Dosaggio / concentrazione',
  'Quantità confezione',
  'Indicazione clinica',
  'Vincoli / controindicazioni',
  'Modalità di somministrazione',
  'Regime di prescrizione',
  'Fascia di peso',
  'Target paziente / fascia di età',
  'Indicazioni regolatorie',
  'Stabilità e conservazione',
  'Via di eliminazione / metabolismo',
  'Interazioni farmacologiche rilevanti',
] as const;

export type PharmaCategoryName = (typeof PHARMA_CATEGORY_NAMES)[number];

/** @deprecated Use PHARMA_VINCOLO_CATEGORY_NAMES — kept for populate script compat. */
export const PHARMA_VINCOLO_CATEGORY = 'Vincoli / controindicazioni' satisfies PharmaCategoryName;

/** Categories stored with type=vincolo in kb_dictionaries. */
export const PHARMA_VINCOLO_CATEGORY_NAMES: readonly PharmaCategoryName[] = [
  'Vincoli / controindicazioni',
  'Fascia di peso',
] as const;

export function isPharmaVincoloCategory(name: string): name is PharmaCategoryName {
  return (PHARMA_VINCOLO_CATEGORY_NAMES as readonly string[]).includes(name);
}

export function isPharmaCategoryName(name: string): name is PharmaCategoryName {
  return (PHARMA_CATEGORY_NAMES as readonly string[]).includes(name);
}
