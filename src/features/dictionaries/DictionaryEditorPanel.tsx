/**
 * Dockview panel wrapper for dictionary editor bodies (always mounted for instant switch).
 */
import type { IDockviewPanelProps } from 'dockview';
import { DictionaryEditorView } from './DictionaryEditorView';

export interface DictionaryEditorPanelParams {
  dictionaryId: string;
}

export function DictionaryEditorPanel(
  props: IDockviewPanelProps<DictionaryEditorPanelParams>,
) {
  return (
    <div className="h-full min-h-0 flex flex-col">
      <DictionaryEditorView dictionaryId={props.params.dictionaryId} />
    </div>
  );
}

export const DICTIONARY_EDITOR_COMPONENTS = {
  dictionaryEditor: DictionaryEditorPanel,
} as const;
