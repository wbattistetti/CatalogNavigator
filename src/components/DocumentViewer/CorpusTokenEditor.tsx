/**
 * Corpus editor: Glide grid with precalculated description + segmentation chips.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import type { TokenCategory } from '../../lib/dictionaryTree';
import type { TokenEntry } from '../../lib/tokenDictionary';
import { isCanonicalToken } from '../../lib/tokenDictionary';
import type { LoadedDictionaryRef } from '../../lib/multiDictionarySegment';
import { useDocumentEditorController, useDocumentEditorDictionaryNav } from '../../features/document-editor/DocumentEditorContext';
import { CorpusChipActionsProvider } from './CorpusChipActionsContext';
import {
  clearDictionaryTokenSelection,
  getDictionarySelectionSnapshot,
} from '../../features/document-editor/dictionarySelectionStore';
import { useCorpusDescriptionFilter } from '../../features/ontology-corpus/useCorpusDescriptionFilter';
import { useCorpusRows } from '../../features/ontology-corpus/useCorpusRows';
import { useOntologyCorpusSegmentation } from '../../features/ontology-corpus/OntologyCorpusSegmentationContext';
import { useOntologyCorpusExtra } from '../../features/ontology-corpus/OntologyCorpusExtraContext';
import { useCorpusChipActions } from '../../features/ontology-corpus/useCorpusChipActions';
import { useCorpusTokenMenus } from '../../features/ontology-corpus/useCorpusTokenMenus';
import { CorpusTableHeader } from '../../features/ontology-corpus/corpus/CorpusTableHeader';
import { CorpusOntologyBuildProgress } from '../../features/ontology-corpus/corpus/CorpusOntologyBuildProgress';
import { CorpusSelectionBanner } from '../../features/ontology-corpus/corpus/CorpusSelectionBanner';
import { CorpusContextMenus } from '../../features/ontology-corpus/corpus/CorpusContextMenus';
import { useCorpusGlideRows } from '../../features/ontology-corpus/corpusGlide/useCorpusGlideRows';
import { mergeExtraAnnotationsIntoGlideRowMap } from '../../features/ontology-corpus/corpusGlide/buildCorpusGlideRows';
import {
  CorpusGlideOverlayProvider,
  type CorpusGlideOverlayContextValue,
} from '../../features/ontology-corpus/corpusGlide/CorpusGlideOverlayContext';
import {
  CorpusGlideGrid,
  type CorpusGlideGridHandle,
} from '../../features/ontology-corpus/corpusGlide/CorpusGlideGrid';

export interface CorpusTokenEditorProps {
  descriptions: string[];
  liveLoadedRefs: LoadedDictionaryRef[];
  tokens: TokenEntry[];
  categories: TokenCategory[];
  editingDictionaryId?: string | null;
  onTokensChange: (tokens: TokenEntry[]) => void;
  onCategoriesChange: (categories: TokenCategory[]) => void;
  onRowFilterStatsChange?: (stats: { visible: number; total: number; active: boolean }) => void;
  /** Saved ontology leaf paths (`analysis.item_paths`). */
  ontologyItemCount?: number;
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
  ontologyItemCount = 0,
}: CorpusTokenEditorProps) {
  const { dictionaryAliasPick } = useDocumentEditorDictionaryNav();
  const {
    refreshOntology,
    ontologyRefreshError,
    dismissOntologyRefreshError,
    partialSaveNotice,
    dismissPartialSaveNotice,
    canRefreshOntology,
    ontologyRefreshDisabledReason,
    cancelOntologyRefresh,
    segmentationPersistError,
    dismissSegmentationPersistError,
    corpusOntologyStatus,
  } = useDocumentEditorController();
  const projectDictionaryId = editingDictionaryId;

  const descriptionFilter = useCorpusDescriptionFilter();
  const { allRows, visibleRows } = useCorpusRows(descriptions, descriptionFilter, onRowFilterStatsChange);

  const segmentation = useOntologyCorpusSegmentation();
  const { extraAnnotations } = useOntologyCorpusExtra();
  const tableRef = useRef<CorpusGlideGridHandle>(null);

  const cacheReady = segmentation.progress.ready;
  const segmentationActive = segmentation.building;
  const hasDisplayableSegmentation = cacheReady || segmentation.cache.size > 0;
  const hasSegmentation = hasDisplayableSegmentation || segmentation.progress.processed > 0;
  const refreshLabel = hasSegmentation ? 'Ricrea ontologia' : 'Crea ontologia';

  useEffect(() => {
    tableRef.current?.scrollToTop();
  }, [descriptionFilter.applied]);

  const editableCanonicalSet = useMemo(
    () => new Set(tokens.filter(isCanonicalToken).map((t) => t.text)),
    [tokens],
  );

  const { glideRowMap, building: glideRowsBuilding, buildProgress: glideBuildProgress } = useCorpusGlideRows(
    allRows,
    segmentation.cache,
    liveLoadedRefs,
    projectDictionaryId,
    categories,
    hasDisplayableSegmentation,
  );

  const displayGlideRowMap = useMemo(
    () => mergeExtraAnnotationsIntoGlideRowMap(
      glideRowMap,
      extraAnnotations,
      liveLoadedRefs,
      projectDictionaryId,
      categories,
    ),
    [glideRowMap, extraAnnotations, liveLoadedRefs, projectDictionaryId, categories],
  );

  const overlayValue = useMemo((): CorpusGlideOverlayContextValue => ({
    matchPhrases: segmentation.matchPhrases,
    liveLoadedRefs,
    editingDictionaryId: projectDictionaryId,
    categories,
    editableCanonicalSet,
    onRemoveSpan: () => {},
    onRemoveCanonical: () => {},
    onMouseDown: () => {},
    onDoubleClick: () => {},
    onMouseUp: () => {},
    onContextMenu: () => {},
  }), [
    segmentation.matchPhrases,
    liveLoadedRefs,
    projectDictionaryId,
    categories,
    editableCanonicalSet,
  ]);

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

  const overlayWithMenus = useMemo((): CorpusGlideOverlayContextValue => ({
    ...overlayValue,
    onRemoveSpan: menus.handleRemoveSpan,
    onRemoveCanonical: menus.handleRemoveCanonical,
    onMouseDown: menus.handleMouseDown,
    onDoubleClick: menus.handleDoubleClick,
    onMouseUp: menus.handleMouseUp,
    onContextMenu: menus.handleContextMenu,
  }), [overlayValue, menus]);

  const handleClearSelectionClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[role="option"]')) return;
    if (getDictionarySelectionSnapshot().selected.size > 0) {
      clearDictionaryTokenSelection();
    }
  };

  const showGrid = hasDisplayableSegmentation && visibleRows.length > 0;
  /** Only block the grid while corpus rows are being segmented — not during background path sync. */
  const refreshInProgress = segmentationActive && !cacheReady;

  const corpusBody = (() => {
    if (visibleRows.length === 0) {
      return (
        <div className="flex-1 flex items-center justify-center px-4 py-8 font-mono text-xs text-emerald-400/35">
          {descriptionFilter.isActive
            ? 'Nessuna descrizione corrisponde al filtro.'
            : 'Nessuna descrizione.'}
        </div>
      );
    }

    if (segmentation.loadingPersisted || segmentation.layoutStabilizing) {
      return (
        <div className="flex-1 flex items-center justify-center gap-2 px-4 py-8 font-mono text-xs text-emerald-400/45">
          <Loader2 className="w-4 h-4 animate-spin" />
          {corpusOntologyStatus.message || 'Caricamento segmentazione…'}
        </div>
      );
    }

    if (segmentationActive || refreshInProgress) {
      return (
        <CorpusOntologyBuildProgress
          segmentationProgress={segmentation.progress}
          onCancel={cancelOntologyRefresh}
        />
      );
    }

    if (!hasDisplayableSegmentation) {
      const partialSaved = segmentation.progress.processed > 0
        && segmentation.progress.total > segmentation.progress.processed;

      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4 py-8 text-center font-mono text-xs text-emerald-400/45">
          <p>
            {corpusOntologyStatus.phase === 'partial'
              ? corpusOntologyStatus.message
              : corpusOntologyStatus.phase === 'stale'
                ? corpusOntologyStatus.message
                : corpusOntologyStatus.phase === 'missing'
                  ? corpusOntologyStatus.message
                  : partialSaved
                    ? `Segmentazione parziale salvata (${segmentation.progress.processed.toLocaleString('it-IT')} / ${segmentation.progress.total.toLocaleString('it-IT')} testi unici).`
                    : segmentation.stale
                      ? 'Il corpus o i dizionari sono cambiati rispetto alla segmentazione salvata.'
                      : 'Segmentazione corpus non disponibile.'}
          </p>
          <p className="text-emerald-400/30">
            Esegui{' '}
            <button
              type="button"
              onClick={() => refreshOntology()}
              disabled={!canRefreshOntology}
              title={ontologyRefreshDisabledReason ?? undefined}
              className="text-amber-200/90 hover:text-amber-100 underline underline-offset-2 decoration-amber-400/40 hover:decoration-amber-300/70 disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed transition-colors"
            >
              {refreshLabel}
            </button>
            {partialSaved
              ? ' per riprendere dove eri o ricominciare da zero.'
              : ' per segmentare e salvare il corpus.'}
          </p>
          {partialSaveNotice && (
            <p className="max-w-md text-sky-300/85 text-[11px] leading-relaxed">
              {partialSaveNotice}
              <button
                type="button"
                onClick={dismissPartialSaveNotice}
                className="ml-2 text-sky-200/60 hover:text-sky-200 underline"
              >
                chiudi
              </button>
            </p>
          )}
          {segmentationPersistError && (
            <p className="mt-2 max-w-md text-amber-300/90 text-[11px] leading-relaxed">
              Segmentazione in memoria pronta; salvataggio su database non riuscito: {segmentationPersistError}
              <button
                type="button"
                onClick={dismissSegmentationPersistError}
                className="ml-2 text-amber-200/60 hover:text-amber-200 underline"
              >
                chiudi
              </button>
            </p>
          )}
          {ontologyRefreshError && (
            <p className="mt-2 max-w-md text-red-300/90 text-[11px] leading-relaxed">
              {ontologyRefreshError}
              <button
                type="button"
                onClick={dismissOntologyRefreshError}
                className="ml-2 text-red-200/60 hover:text-red-200 underline"
              >
                chiudi
              </button>
            </p>
          )}
        </div>
      );
    }

    if (!showGrid) {
      if (glideRowsBuilding) {
        const glidePct = glideBuildProgress.total > 0
          ? Math.round((glideBuildProgress.processed / glideBuildProgress.total) * 100)
          : 0;
        return (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 px-4 py-8 font-mono text-xs text-emerald-400/45">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>
              Preparazione griglia…
              {glideBuildProgress.total > 0
                ? ` ${glideBuildProgress.processed.toLocaleString('it-IT')} / ${glideBuildProgress.total.toLocaleString('it-IT')}`
                : ''}
            </span>
            {glideBuildProgress.total > 0 && (
              <span className="text-emerald-400/30 tabular-nums">{glidePct}%</span>
            )}
          </div>
        );
      }

      return (
        <div className="flex-1 flex items-center justify-center px-4 py-8 font-mono text-xs text-emerald-400/35">
          Nessuna riga da mostrare.
        </div>
      );
    }

    return (
      <CorpusGlideGrid
        ref={tableRef}
        visibleRows={visibleRows}
        glideRowMap={displayGlideRowMap}
        onClearSelectionClick={handleClearSelectionClick}
      />
    );
  })();

  return (
    <CorpusChipActionsProvider value={chipActions}>
      <div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden">
        <div className="flex-1 min-h-0 min-w-0 flex border border-[#1a3a2a] rounded overflow-hidden bg-[#080e0a]">
          <CorpusGlideOverlayProvider value={overlayWithMenus}>
            <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-hidden">
              <CorpusTableHeader
                filter={descriptionFilter}
                progress={segmentation.progress}
                ontologyItemCount={ontologyItemCount}
                loadingPersisted={segmentation.loadingPersisted}
                building={segmentationActive}
                stale={segmentation.stale}
              />
              <CorpusSelectionBanner />
              <div className="flex flex-col flex-1 min-h-0 min-w-0 w-full overflow-hidden">
                {corpusBody}
              </div>
            </div>
          </CorpusGlideOverlayProvider>
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
