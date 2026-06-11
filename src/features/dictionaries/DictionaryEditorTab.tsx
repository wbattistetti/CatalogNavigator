/**
 * Draggable tab chrome for dictionary panels — nested dock inside Dizionari only.
 * Project tabs include «Salva in libreria» inline in the tab header.
 */
import type { IDockviewPanelHeaderProps } from 'dockview';
import { parseDictionaryEditorPanelId } from '../../lib/dictionaryEditorDockPanelIds';
import { useDocumentEditorController } from '../document-editor/DocumentEditorContext';
import { DictionaryIcon } from '../../components/DocumentViewer/DictionaryIcon';
import { dictionaryTabDisplayName } from '../../lib/dictionaryTabOrder';
import { SaveProjectToLibraryPanel } from './SaveProjectToLibraryPanel';
import { usePromoteProjectToLibrary } from './usePromoteProjectToLibrary';

export function DictionaryEditorTab(props: IDockviewPanelHeaderProps) {
  const { dicts } = useDocumentEditorController();
  const dictionaryId = parseDictionaryEditorPanelId(props.api.id);
  const meta = dictionaryId ? dicts.getDictionaryMeta(dictionaryId) : null;
  const session = dictionaryId ? dicts.getSession(dictionaryId) : null;
  const active = props.api.isActive;
  const isProjectDict = meta?.scope === 'project';
  const tokenCount = session?.tokens.filter((t) => !t.aliasOf).length ?? 0;

  const {
    suggestedName,
    busy: promoteBusy,
    error: promoteError,
    promote,
    tokenCount: promoteTokenCount,
  } = usePromoteProjectToLibrary(isProjectDict ? dictionaryId : null);

  return (
    <div
      data-project-tab={isProjectDict ? '' : undefined}
      className={`flex items-center gap-1.5 px-2 font-mono text-xs min-w-0 h-full w-full ${
        active ? 'text-emerald-50' : 'text-emerald-300/75'
      }`}
    >
      <div className="flex items-center gap-1.5 min-w-0 flex-shrink">
        {meta && (
          <DictionaryIcon iconKey={meta.icon_key} iconColor={meta.icon_color} size="xs" />
        )}
        <span className="truncate max-w-[8rem]">
          {meta ? dictionaryTabDisplayName(meta) : 'Dizionario'}
        </span>
        <span className="text-emerald-400/80 tabular-nums flex-shrink-0 text-xs">({tokenCount})</span>
        {session?.dirty && (
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Modifiche non salvate" />
        )}
      </div>
      {isProjectDict && active && meta && (
        <div
          className="ml-auto flex-shrink-0"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <SaveProjectToLibraryPanel
            suggestedName={suggestedName}
            defaultIndustry={meta.industry}
            defaultIndustryCustom={meta.industry_custom}
            defaultDescription={meta.description}
            tokenCount={promoteTokenCount}
            busy={promoteBusy}
            error={promoteError}
            onConfirm={promote}
            menuAlign="right"
          />
        </div>
      )}
    </div>
  );
}
