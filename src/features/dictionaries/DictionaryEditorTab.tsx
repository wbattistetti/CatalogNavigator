/**
 * Draggable tab chrome for dictionary panels — nested dock inside Dizionari only.
 */
import type { IDockviewPanelHeaderProps } from 'dockview';
import { parseDictionaryEditorPanelId } from '../../lib/dictionaryEditorDockPanelIds';
import { useDocumentEditor } from '../document-editor/DocumentEditorContext';
import { DictionaryIcon } from '../../components/DocumentViewer/DictionaryIcon';
import { dictionaryTabDisplayName } from '../../lib/dictionaryTabOrder';

export function DictionaryEditorTab(props: IDockviewPanelHeaderProps) {
  const { dicts } = useDocumentEditor();
  const dictionaryId = parseDictionaryEditorPanelId(props.api.id);
  const meta = dictionaryId ? dicts.getDictionaryMeta(dictionaryId) : null;
  const session = dictionaryId ? dicts.getSession(dictionaryId) : null;
  const active = props.api.isActive;
  const tokenCount = session?.tokens.filter((t) => !t.aliasOf).length ?? 0;

  return (
    <div
      className={`flex items-center gap-1.5 px-2 font-mono text-[10px] min-w-0 h-full ${
        active ? 'text-emerald-50' : 'text-emerald-300/75'
      }`}
    >
      {meta && (
        <DictionaryIcon iconKey={meta.icon_key} iconColor={meta.icon_color} size="xs" />
      )}
      <span className="truncate max-w-[10rem]">
        {meta ? dictionaryTabDisplayName(meta) : 'Dizionario'}
      </span>
      <span className="text-emerald-400/80 tabular-nums flex-shrink-0">({tokenCount})</span>
      {session?.dirty && (
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Modifiche non salvate" />
      )}
    </div>
  );
}
