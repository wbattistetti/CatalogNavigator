/**
 * Dockview panel wrapper — one dictionary editor inside the nested Dizionari dock.
 */
import type { IDockviewPanelProps } from 'dockview';
import { DictionaryEditorView } from './DictionaryEditorView';

export interface DictionaryEditorPanelParams {
  dictionaryId: string;
}

export function DictionaryEditorPanel(
  props: IDockviewPanelProps<DictionaryEditorPanelParams>,
) {
  return <DictionaryEditorView dictionaryId={props.params.dictionaryId} />;
}

export const DICTIONARY_EDITOR_COMPONENTS = {
  dictionaryEditor: DictionaryEditorPanel,
} as const;
