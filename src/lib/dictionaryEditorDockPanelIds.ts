/** Stable panel ids for dictionary editor panels inside the nested Dizionari dock. */
const PREFIX = 'dict-editor:';

export function dictionaryEditorPanelId(dictionaryId: string): string {
  return `${PREFIX}${dictionaryId}`;
}

export function parseDictionaryEditorPanelId(panelId: string): string | null {
  if (!panelId.startsWith(PREFIX)) return null;
  return panelId.slice(PREFIX.length) || null;
}
