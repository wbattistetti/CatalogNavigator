/**
 * Category definitions for the Farmaci library dictionary (pharma CSV import).
 */
export const PHARMA_DICTIONARY_NAME = 'Farmaci';

export const PHARMA_CATEGORY_NAMES = [
  'Principio attivo',
  'Nome commerciale',
  'Classe terapeutica',
  'Forma farmaceutica',
  'Forma di confezionamento',
  'Dosaggio / concentrazione',
  'Quantità confezione',
  'Indicazione clinica',
  'Vincoli / controindicazioni',
  'Modalità di somministrazione',
  'Regime di prescrizione',
  'Target paziente / fascia di età',
  'Indicazioni regolatorie',
  'Stabilità e conservazione',
  'Via di eliminazione / metabolismo',
  'Interazioni farmacologiche rilevanti',
] as const;

export type PharmaCategoryName = (typeof PHARMA_CATEGORY_NAMES)[number];

export const PHARMA_VINCOLO_CATEGORY = 'Vincoli / controindicazioni' satisfies PharmaCategoryName;

export function isPharmaCategoryName(name: string): name is PharmaCategoryName {
  return (PHARMA_CATEGORY_NAMES as readonly string[]).includes(name);
}
