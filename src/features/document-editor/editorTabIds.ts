/** Stable ids for main document editor dock panels and navigation. */
export const EDITOR_TAB_IDS = {
  document: 'document',
  dictionaries: 'dictionaries',
  ontology: 'ontology',
  disambiguation: 'disambiguation',
  report: 'report',
} as const;

export type EditorTabId = (typeof EDITOR_TAB_IDS)[keyof typeof EDITOR_TAB_IDS];

export const EDITOR_TAB_SUBTITLES: Record<EditorTabId, string> = {
  [EDITOR_TAB_IDS.document]: 'DOCUMENTO ORIGINALE',
  [EDITOR_TAB_IDS.dictionaries]: 'DIZIONARI · LIBRERIA',
  [EDITOR_TAB_IDS.ontology]: 'ONTOLOGIA · CORPUS',
  [EDITOR_TAB_IDS.disambiguation]: 'MESSAGGI DI DISAMBIGUAZIONE',
  [EDITOR_TAB_IDS.report]: 'REPORT INTEGRITÀ CATALOGO',
};
