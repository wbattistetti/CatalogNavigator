/**
 * Draggable tab chrome for dictionary panels — nested dock inside Dizionari only.
 * Project tabs include «Salva in libreria» inline in the tab header.
 */
import { Library, X } from 'lucide-react';
import type { IDockviewPanelHeaderProps } from 'dockview';
import { parseDictionaryEditorPanelId } from '../../lib/dictionaryEditorDockPanelIds';
import { useDocumentEditorController } from '../document-editor/DocumentEditorContext';
import { DictionaryIcon } from '../../components/DocumentViewer/DictionaryIcon';
import { dictionaryTabDisplayName } from '../../lib/dictionaryTabOrder';
import { SaveProjectToLibraryPanel } from './SaveProjectToLibraryPanel';
import { usePromoteProjectToLibrary } from './usePromoteProjectToLibrary';

export function DictionaryEditorTab(props: IDockviewPanelHeaderProps) {
  const { dicts, handleUnloadLibraryDictionary } = useDocumentEditorController();
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

  const isLibraryDict = meta?.scope === 'library';

  return (
    <div
      data-project-tab={isProjectDict ? '' : undefined}
      data-library-tab={isLibraryDict ? '' : undefined}
      className={`flex items-center gap-1.5 px-2 font-mono text-xs min-w-0 h-full w-full border-b-2 ${
        isLibraryDict
          ? active
            ? 'text-sky-100 border-sky-400/70'
            : 'text-sky-300/80 border-transparent'
          : active
            ? 'text-emerald-50 border-emerald-400/50'
            : 'text-emerald-300/75 border-transparent'
      }`}
    >
      <div className="flex items-center gap-1.5 min-w-0 flex-shrink">
        {isLibraryDict && (
          <Library className="w-3 h-3 flex-shrink-0 text-sky-400/80" aria-hidden />
        )}
        {meta && (
          <DictionaryIcon iconKey={meta.icon_key} iconColor={meta.icon_color} size="xs" />
        )}
        <span className={`truncate ${isLibraryDict ? 'max-w-[10rem]' : 'max-w-[8rem]'}`}>
          {meta ? dictionaryTabDisplayName(meta) : 'Dizionario'}
        </span>
        <span className={`tabular-nums flex-shrink-0 text-xs ${
          isLibraryDict ? 'text-sky-400/80' : 'text-emerald-400/80'
        }`}>
          ({tokenCount})
        </span>
        {session?.dirty && (
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Modifiche non salvate" />
        )}
      </div>
      {isLibraryDict && dictionaryId && (
        <div
          className="ml-auto flex-shrink-0"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => void handleUnloadLibraryDictionary(dictionaryId)}
            className="p-0.5 rounded text-sky-300/60 hover:text-red-400 hover:bg-red-400/10 transition-colors"
            title="Scollega dizionario libreria dal progetto"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
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
