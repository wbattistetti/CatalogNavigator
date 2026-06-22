/**
 * Controlled vocabularies for pharma dictionary refactor (containers, forms, routes).
 */

export const CONTAINER_CANONICAL: Record<string, string> = {
  flacone: 'flacone',
  flaconcino: 'flaconcino',
  flaconcini: 'flaconcino',
  flaconi: 'flacone',
  flac: 'flacone',
  'flac.': 'flacone',
  fiala: 'fiala',
  fiale: 'fiala',
  blister: 'blister',
  blisters: 'blister',
  pipetta: 'pipetta',
  pipette: 'pipetta',
  applicatore: 'applicatore',
  applicatori: 'applicatore',
  contagocce: 'contagocce',
  dosatore: 'dosatore',
  siringa: 'siringa',
  siringhe: 'siringa',
  scatola: 'scatola',
  sacca: 'sacca',
  sacche: 'sacca',
  sacchetto: 'sacchetto',
  bustina: 'bustina',
  buste: 'bustina',
  vaschetta: 'vaschetta',
  vaschette: 'vaschette',
  collare: 'collare',
  collari: 'collare',
  tubo: 'tubo',
  tubetto: 'tubetto',
  barattolo: 'barattolo',
  secchio: 'secchio',
  fusto: 'fusto',
  bottiglia: 'bottiglia',
  contenitore: 'contenitore',
  strip: 'strip',
  bombola: 'bombola',
};

export const MATERIAL_CANONICAL: Record<string, string> = {
  vetro: 'vetro',
  hdpe: 'HDPE',
  pet: 'PET',
  pp: 'PP',
  polipropilene: 'polipropilene',
  ldpe: 'LDPE',
  plastica: 'plastica',
  pvc: 'PVC',
  alluminio: 'alluminio',
  cartone: 'cartone',
  ambrato: 'vetro ambrato',
};

export const GALENIC_FORMS = new Set([
  'compresse',
  'compressa',
  'compresse masticabili',
  'compressa masticabile',
  'compresse rivestite',
  'compresse rivestite con film',
  'compresse appetibili',
  'soluzione',
  'soluzione orale',
  'soluzione iniettabile',
  'sospensione',
  'sospensione orale',
  'sospensione iniettabile',
  'emulsione',
  'emulsione iniettabile',
  'polvere',
  'polvere liofilizzata',
  'liofilizzato',
  'granulato',
  'gel',
  'pomata',
  'collirio',
  'gocce',
  'gocce orali',
  'premiscela',
  'pastiglie',
  'capsule',
  'pasta orale',
  'impianto',
  'dispositivo intraruminale',
  'dispositivo intravaginale',
  'solvente',
  'diluente',
  'antisiero',
  'liquido iniettabile',
]);

export const CONTAINER_ONLY = new Set(Object.values(CONTAINER_CANONICAL));

export const MODALITY_CANONICAL: Record<string, string> = {
  orale: 'orale',
  orali: 'orale',
  iniettabile: 'iniettabile',
  'spot on': 'spot on',
  'spot-on': 'spot on',
  'pour on': 'pour on',
  'pour-on': 'pour on',
  cutaneo: 'cutaneo',
  cutanea: 'cutaneo',
  topico: 'topico',
  topica: 'topico',
  auricolare: 'auricolare',
  intramuscolare: 'intramuscolare',
  sottocutaneo: 'sottocutaneo',
  sottocutanea: 'sottocutaneo',
  sottocute: 'sottocutaneo',
  intramammaria: 'intramammaria',
  intrammammaria: 'intramammaria',
  inalazione: 'inalazione',
  infusione: 'infusione',
  'acqua da bere': 'acqua da bere',
  'in acqua da bere': 'acqua da bere',
};

export const REGIME_PHRASES = new Set([
  'libera vendita',
  'non ripetibile',
  'ripetibile',
  'triplice copia',
  'triplice copia non ripetibile',
  'in triplice copia non ripetibile',
  'speciale stupefacente',
  'senza obbligo di prescrizione',
]);

export const SPECIES_SHORT: Record<string, string> = {
  cani: 'cani',
  gatti: 'gatti',
  bovini: 'bovini',
  suini: 'suini',
  ovini: 'ovini',
  cavalli: 'cavalli',
  equidi: 'equidi',
  avicoli: 'avicoli',
  pesci: 'pesci',
  roditori: 'roditori',
  ruminanti: 'ruminanti',
};

export const BRAND_STOP_PATTERNS: RegExp[] = [
  /\s+\d+[.,]?\d*\s*%/i,
  /\s+\d+(?:[.,]\d+)?(?:MG\/ML|MCG\/ML|MG|ML|G|KG|MCG|UI)(?:\/ML|\b)/i,
  /\s+\d+[.,]?\d*\s*(?:MG\/ML|MCG\/ML|MG|ML|G|KG|MCG|UI)/i,
  /\s+-\s+/,
  /\s+(?:COMPRESS|SOSPENSION|SOLUZION|SPOT\s*ON|POUR\s*ON|INIETTAB|INJECT|OTIC|FLAVOUR|SPRAY|SHAMPOO|GOCCE|AURICOL|PASTA|GEL|POMATA|BLISTER|FLACONE|FLACONCIN)/i,
  /\s+SPOT\b/i,
  /\s+TAGLIA\b/i,
  /\s+PER\s+(?:CANI|GATTI|BOVINI|SUINI|OVINI|CAVAL|PECOR|EQUIN|AVICOL|PESCI|RODITOR|RUMINANT|ANIMALI)/i,
  /\s+(?:CANI|GATTI|BOVINI|SUINI|OVINI|CAVAL|PECOR|EQUIN|AVICOL|PESCI|RODITOR|RUMINANT)\s*$/i,
  /\s+DA\s+\d/i,
  /\s*\(\s*A\.I\.P\.\s*\)/i,
  /\s+(?:E\.C\.|O\.L\.|L\.A\.|I\.V\.|S\.C\.|I\.M\.)/i,
];

/** Detects catalog attributes embedded in a supposed brand string. */
export const BRAND_COMPOSITE_RE =
  /\d|(?:\bmg\b|\bml\b|\bg\b|%)|soluzion|sospension|spot|pour\s*on|iniettab|inject|compress|gocce|gel\b|pomata|shampoo|spray|flacon|blister|taglia|\bda\s+\d|\bper\s+(?:cani|gatti|bovini|suini|ovini|cavalli)/i;

/** Max words for a canonical commercial name (brand + optional product line). */
export const MAX_PURE_BRAND_WORDS = 4;

export const DOSE_IN_PRINCIPIO_RE =
  /\s+-\s+\d+[.,]?\d*\s*(?:MILLIGRAMMO|MILLILITRO|GRAMMO|MG\/ML|MCG\/ML|MG|ML|G|KG|UI|UNITÀ|OOCISTI|DOSI|DP90|EID|TCID)/i;

export const DOSAGE_VALUE_RE =
  /(\d+[.,]?\d*)\s*(%|MG\/ML|MCG\/ML|MG|ML|G|KG|UI|U\.I\.|MCG|MMOL\/L)/gi;

export const QUANTITY_RE =
  /(\d+[.,]?\d*)\s*(ML|LITRI?|L|G|KG|DOSI|DOSE|CPR|COMPRESSE?|PIPETTE?|BLISTER|FLACONCINI?|FLACONI?|FIALE?|APPLICATORI?|COLLARI?|BUSTE?|SIRINGHE?|UNITÀ|OOCISTI)/gi;
