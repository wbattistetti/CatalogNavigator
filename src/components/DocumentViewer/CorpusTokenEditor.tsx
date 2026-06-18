/**
 * Corpus editor: paired description/segmentation rows (dictionary tree lives in Dizionari tab).
 */
import { useEffect, useMemo, useRef } from 'react';
import type { TokenCategory } from '../../lib/dictionaryTree';
import type { TokenEntry } from '../../lib/tokenDictionary';
import { isCanonicalToken } from '../../lib/tokenDictionary';
import type { LoadedDictionaryRef } from '../../lib/multiDictionarySegment';
import { useDocumentEditorDictionaryNav } from '../../features/document-editor/DocumentEditorContext';
import { CorpusChipActionsProvider } from './CorpusChipActionsContext';
import {
  clearDictionaryTokenSelection,
  getDictionarySelectionSnapshot,
} from '../../features/document-editor/dictionarySelectionStore';
import { useCorpusDescriptionFilter } from '../../features/ontology-corpus/useCorpusDescriptionFilter';
import { useCorpusRows } from '../../features/ontology-corpus/useCorpusRows';
import {
  useOntologyCorpusSegmentation,
} from '../../features/ontology-corpus/OntologyCorpusSegmentationContext';
import { useCorpusChipActions } from '../../features/ontology-corpus/useCorpusChipActions';
import { useCorpusTokenMenus } from '../../features/ontology-corpus/useCorpusTokenMenus';
import { CorpusVirtualTable, type CorpusVirtualTableHandle } from '../../features/ontology-corpus/corpus/CorpusVirtualTable';
import { CorpusContextMenus } from '../../features/ontology-corpus/corpus/CorpusContextMenus';

export interface CorpusTokenEditorProps {
  descriptions: string[];
  liveLoadedRefs: LoadedDictionaryRef[];
  tokens: TokenEntry[];
  categories: TokenCategory[];
  editingDictionaryId?: string | null;
  onTokensChange: (tokens: TokenEntry[]) => void;
  onCategoriesChange: (categories: TokenCategory[]) => void;
  onRowFilterStatsChange?: (stats: { visible: number; total: number; active: boolean }) => void;
}

export function CorpusTokenEditor({
  descriptions,
  liveLoadedRefs,
  tokens,
  categories,
  editingDictionaryId = null,
  onTokensChange,
  onCategoriesChange,
  onRowFilterStatsChange,
}: CorpusTokenEditorProps) {
  const { dictionaryAliasPick } = useDocumentEditorDictionaryNav();
  const projectDictionaryId = editingDictionaryId;

  const descriptionFilter = useCorpusDescriptionFilter();
  const { visibleRows } = useCorpusRows(descriptions, descriptionFilter, onRowFilterStatsChange);

  const segmentation = useOntologyCorpusSegmentation();
  const tableRef = useRef<CorpusVirtualTableHandle>(null);

  useEffect(() => {
    tableRef.current?.scrollToTop();
  }, [descriptionFilter.applied]);

  const editableCanonicalSet = useMemo(
    () => new Set(tokens.filter(isCanonicalToken).map((t) => t.text)),
    [tokens],
  );

  const { chipActions, dragGhostRef } = useCorpusChipActions(
    editableCanonicalSet,
    categories,
    onCategoriesChange,
  );

  const menus = useCorpusTokenMenus({
    tokens,
    categories,
    projectDictionaryId,
    onTokensChange,
    onCategoriesChange,
    dictionaryAliasPick,
  });

  const handleClearSelectionClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[role="option"]')) return;
    if (getDictionarySelectionSnapshot().selected.size > 0) {
      clearDictionaryTokenSelection();
    }
  };

  return (
    <CorpusChipActionsProvider value={chipActions}>
      <div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden">
        <div className="flex-1 min-h-0 min-w-0 flex border border-[#1a3a2a] rounded overflow-hidden bg-[#080e0a]">
          <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-hidden">
            <CorpusVirtualTable
              ref={tableRef}
              rows={visibleRows}
              filter={descriptionFilter}
              filterActive={descriptionFilter.isActive}
              segmentation={segmentation}
              matchPhrases={segmentation.matchPhrases}
              liveLoadedRefs={liveLoadedRefs}
              editingDictionaryId={projectDictionaryId}
              categories={categories}
              editableCanonicalSet={editableCanonicalSet}
              onRemoveSpan={menus.handleRemoveSpan}
              onRemoveCanonical={menus.handleRemoveCanonical}
              onMouseDown={menus.handleMouseDown}
              onDoubleClick={menus.handleDoubleClick}
              onMouseUp={menus.handleMouseUp}
              onContextMenu={menus.handleContextMenu}
              onClearSelectionClick={handleClearSelectionClick}
            />
          </div>
        </div>
      </div>

      <CorpusContextMenus
        menu={menus.menu}
        menuRef={menus.menuRef}
        longerTokenPrompt={menus.longerTokenPrompt}
        longerPromptRef={menus.longerPromptRef}
        dragGhostRef={dragGhostRef}
        menuPhrase={menus.menuPhrase}
        menuIsCanonical={menus.menuIsCanonical}
        menuAliasEntry={menus.menuAliasEntry}
        canCreateToken={menus.canCreateToken}
        canStartAliasPick={menus.canStartAliasPick}
        onCreateToken={menus.createTokenFromMenu}
        onStartAliasPick={menus.startAliasPick}
        onRemoveCanonical={(text) => {
          menus.handleRemoveCanonical(text);
          menus.setMenu(null);
        }}
        onRemoveAlias={(text) => {
          menus.handleRemoveAlias(text);
          menus.setMenu(null);
        }}
        onDismissLongerPrompt={() => {
          menus.setLongerTokenPrompt(null);
          window.getSelection()?.removeAllRanges();
        }}
        onConfirmShorterToken={() => {
          if (menus.longerTokenPrompt) {
            menus.commitNewToken(menus.longerTokenPrompt.raw, menus.longerTokenPrompt.range);
            menus.setLongerTokenPrompt(null);
          }
        }}
      />
    </CorpusChipActionsProvider>
  );
}
