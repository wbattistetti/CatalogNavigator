/**
 * Glide grid for ontology corpus: description, extra, segmentation (canvas + click hit layers).
 */
import '@glideapps/glide-data-grid/dist/index.css';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  DataEditor,
  GridCellKind,
  CompactSelection,
  type CellClickedEventArgs,
  type CustomCell,
  type CustomRenderer,
  type DataEditorRef,
  type GridCell,
  type GridColumn,
  type GridSelection,
  type Item,
  type Rectangle,
} from '@glideapps/glide-data-grid';
import { useContainerSize } from '../../../hooks/useContainerSize';
import {
  tabularGlideInstallLongTaskWatcher,
  tabularGlideLogMount,
  tabularGlideLogScrollRegion,
} from '../../../components/DocumentViewer/tabularGlideDebug';
import { TABULAR_GLIDE_THEME } from '../../../components/DocumentViewer/tabularGlideTheme';
import {
  GLIDE_CHIP_CELL,
  buildGlideChipCell,
  drawGlideChipPills,
  glideChipRenderer,
  isGlideChipCell,
} from '../../../lib/glideChipRenderer';
import {
  GLIDE_DESC_CELL,
  buildGlideDescCell,
  drawDescriptionRuns,
  glideDescriptionRenderer,
  isGlideDescCell,
} from '../../../lib/glideDescriptionRenderer';
import type { GlideDescCellData } from '../../../lib/glideDescriptionRenderer';
import type { CorpusRow } from '../corpusRowModel';
import type { CorpusGlideRow } from './buildCorpusGlideRows';
import { CorpusGlideDescriptionHitLayer } from './CorpusGlideDescriptionHitLayer';
import { CorpusGlideSegmentationHitLayer } from './CorpusGlideSegmentationEditor';
import {
  corpusGlideColumnWidths,
  estimateCorpusGlideRowHeight,
} from '../../../lib/glideWrapLayout';
import type { GlideChipCellData } from '../../../lib/glideChipRenderer';
import { resolveGlideCellScreenRect, type GlideCellScreenRect } from './resolveGlideCellScreenRect';
import { useOntologyCorpusExtra } from '../OntologyCorpusExtraContext';
import { isCorpusExtraDropDebugEnabled, logCorpusExtraDrop } from '../../../lib/corpusExtraDropDebug';
import {
  CORPUS_GLIDE_COL_DESCRIPTION,
  CORPUS_GLIDE_COL_EXTRA,
  CORPUS_GLIDE_COL_INDEX,
  CORPUS_GLIDE_COL_SEGMENTATION,
} from './corpusGlideColumns';
import { useCorpusExtraCellEditor } from './extra/useCorpusExtraCellEditor';
import { useCorpusExtraDrop } from './extra/useCorpusExtraDrop';
import { createExtraColumnRenderer } from './extra/drawExtraColumnCell';
import { CorpusExtraCellEditor } from './extra/CorpusExtraCellEditor';
import { CorpusExtraColumnHeaderClear } from './extra/CorpusExtraColumnHeaderClear';
import { extraColumnDisplayRowsFromGridSelection } from './extra/extraColumnDisplayRowsFromGridSelection';

export {
  CORPUS_GLIDE_COL_INDEX,
  CORPUS_GLIDE_COL_DESCRIPTION,
  CORPUS_GLIDE_COL_EXTRA,
  CORPUS_GLIDE_COL_SEGMENTATION,
} from './corpusGlideColumns';

const CORPUS_GLIDE_MIN_ROW_HEIGHT = 48;

const CORPUS_GLIDE_HEADER_HEIGHT = 36;

const EMPTY_GRID_SELECTION: GridSelection = {
  columns: CompactSelection.empty(),
  rows: CompactSelection.empty(),
};

const CORPUS_COLUMNS: GridColumn[] = [
  { title: '#', id: 'index', width: 56 },
  { title: 'descrizione', id: 'description', width: 320, grow: 1 },
  { title: 'extra', id: 'extra', width: 160, grow: 0 },
  { title: 'segmentazione', id: 'segmentation', width: 280, grow: 1 },
];

export interface CorpusGlideGridHandle {
  scrollToTop: () => void;
}

interface DescriptionHitState {
  displayRow: number;
  descData: GlideDescCellData;
  anchor: GlideCellScreenRect;
}

interface SegmentationHitState {
  displayRow: number;
  chipData: GlideChipCellData;
  anchor: GlideCellScreenRect;
}

export interface CorpusGlideGridProps {
  visibleRows: readonly CorpusRow[];
  glideRowMap: ReadonlyMap<number, CorpusGlideRow>;
  onClearSelectionClick: (e: React.MouseEvent) => void;
}

export const CorpusGlideGrid = forwardRef(function CorpusGlideGrid(
  {
    visibleRows,
    glideRowMap,
    onClearSelectionClick,
  }: CorpusGlideGridProps,
  ref: React.ForwardedRef<CorpusGlideGridHandle>,
) {
  const {
    addExtraTokens,
    extraAnnotations,
    clearAllExtraAnnotations,
    selectedDisplayRows: extraSelection,
    replaceExtraSelection,
    clearExtraSelection,
    resolveDropTargetRowIndices,
  } = useOntologyCorpusExtra();
  const { containerRef, size } = useContainerSize();
  const gridRef = useRef<DataEditorRef>(null);
  const [descriptionHit, setDescriptionHit] = useState<DescriptionHitState | null>(null);
  const [segmentationHit, setSegmentationHit] = useState<SegmentationHitState | null>(null);
  const [gridSelection, setGridSelection] = useState<GridSelection>(EMPTY_GRID_SELECTION);

  const descriptionHitRef = useRef<DescriptionHitState | null>(null);
  const segmentationHitRef = useRef<SegmentationHitState | null>(null);
  const prevDescriptionHitRef = useRef<DescriptionHitState | null>(null);
  const prevSegmentationHitRef = useRef<SegmentationHitState | null>(null);
  descriptionHitRef.current = descriptionHit;
  segmentationHitRef.current = segmentationHit;

  const visibleRowsRef = useRef(visibleRows);
  visibleRowsRef.current = visibleRows;
  const glideRowMapRef = useRef(glideRowMap);
  glideRowMapRef.current = glideRowMap;

  const extraSelectionRef = useRef(extraSelection);
  extraSelectionRef.current = extraSelection;

  const {
    editor: extraEditor,
    open: openExtraEditor,
    close: closeExtraEditor,
  } = useCorpusExtraCellEditor(gridRef, containerRef, visibleRowsRef, glideRowMapRef);

  const extraEditorDisplayRowRef = useRef<number | null>(null);
  extraEditorDisplayRowRef.current = extraEditor?.displayRow ?? null;

  const { dropDebugLine, handleDragOver, handleDrop } = useCorpusExtraDrop({
    gridRef,
    containerRef,
    visibleRowsRef,
    addExtraTokens,
    resolveDropTargetRowIndices,
    onDropApplied: closeExtraEditor,
  });

  useEffect(() => tabularGlideInstallLongTaskWatcher(), []);

  useImperativeHandle(ref, () => ({
    scrollToTop: () => {
      gridRef.current?.scrollTo(0, 0, 'vertical', 0, 0);
    },
  }), []);

  const getCellContent = useCallback(([col, row]: Item): GridCell => {
    const corpusRow = visibleRowsRef.current[row];
    if (!corpusRow) {
      return { kind: GridCellKind.Loading, allowOverlay: false };
    }

    const glideRow = glideRowMapRef.current.get(corpusRow.rowIndex);
    const text = corpusRow.text;

    if (col === CORPUS_GLIDE_COL_INDEX) {
      const label = String(corpusRow.rowIndex + 1);
      return {
        kind: GridCellKind.Text,
        data: label,
        displayData: label,
        readonly: true,
        allowOverlay: false,
      };
    }

    if (col === CORPUS_GLIDE_COL_DESCRIPTION) {
      if (!glideRow) {
        return {
          kind: GridCellKind.Text,
          data: text,
          displayData: text,
          readonly: true,
          allowOverlay: false,
          allowWrapping: true,
        };
      }
      return buildGlideDescCell({
        type: GLIDE_DESC_CELL,
        sourceText: text,
        runs: glideRow.descriptionRuns,
      });
    }

    if (col === CORPUS_GLIDE_COL_EXTRA) {
      const paints = glideRow?.extraPaints ?? [];
      return buildGlideChipCell({
        type: GLIDE_CHIP_CELL,
        sourceText: text,
        segments: paints,
        unmatched: [],
      });
    }

    if (col === CORPUS_GLIDE_COL_SEGMENTATION) {
      const paints = glideRow?.segPaints ?? [];
      const unmatched = glideRow?.segmentation?.unmatched ?? [];
      return buildGlideChipCell({
        type: GLIDE_CHIP_CELL,
        sourceText: text,
        segments: paints,
        unmatched,
      });
    }

    return { kind: GridCellKind.Loading, allowOverlay: false };
  }, []);

  const gridReady = size.width > 0 && size.height > 0;
  const columnWidths = useMemo(
    () => corpusGlideColumnWidths(size.width),
    [size.width],
  );

  const gridColumns = useMemo((): GridColumn[] => [
    { ...CORPUS_COLUMNS[0]!, width: columnWidths.index },
    { ...CORPUS_COLUMNS[1]!, width: columnWidths.description },
    { ...CORPUS_COLUMNS[2]!, width: columnWidths.extra },
    { ...CORPUS_COLUMNS[3]!, width: columnWidths.segmentation },
  ], [columnWidths]);

  const getRowHeight = useCallback((row: number) => {
    const corpusRow = visibleRowsRef.current[row];
    if (!corpusRow) return CORPUS_GLIDE_MIN_ROW_HEIGHT;
    const glideRow = glideRowMapRef.current.get(corpusRow.rowIndex);
    return estimateCorpusGlideRowHeight({
      sourceText: corpusRow.text,
      descriptionRuns: glideRow?.descriptionRuns ?? (
        corpusRow.text.length > 0 ? [{ kind: 'text', text: corpusRow.text }] : []
      ),
      segmentTexts: glideRow?.segPaints.map((p) => p.text) ?? [],
      extraSegmentTexts: glideRow?.extraPaints.map((p) => p.text) ?? [],
      unmatchedCount: glideRow?.segmentation?.unmatched.length ?? 0,
      descriptionColWidth: columnWidths.description,
      segmentationColWidth: columnWidths.segmentation,
      extraColWidth: columnWidths.extra,
      minHeight: CORPUS_GLIDE_MIN_ROW_HEIGHT,
    });
  }, [columnWidths.description, columnWidths.segmentation, columnWidths.extra, glideRowMap]);

  useEffect(() => {
    if (!gridReady || visibleRows.length === 0) return;
    const raf = requestAnimationFrame(() => {
      gridRef.current?.updateCells(
        visibleRows.flatMap((_, row) => (
          [0, 1, 2, 3].map((col) => ({ cell: [col, row] as Item }))
        )),
      );
    });
    return () => cancelAnimationFrame(raf);
  }, [glideRowMap, gridReady, visibleRows, columnWidths.description, columnWidths.segmentation, columnWidths.extra]);

  useEffect(() => {
    if (!gridReady) return;
    tabularGlideLogMount('corpus-glide-ready', {
      width: size.width,
      height: size.height,
      rows: visibleRows.length,
      cols: gridColumns.length,
    });
  }, [gridReady, size.width, size.height, visibleRows.length, gridColumns.length]);

  const closeDescriptionHit = useCallback(() => setDescriptionHit(null), []);
  const closeSegmentationHit = useCallback(() => setSegmentationHit(null), []);

  const openDescriptionHit = useCallback((cell: Item, eventBounds?: Rectangle) => {
    const [col, row] = cell;
    if (col !== CORPUS_GLIDE_COL_DESCRIPTION) return;
    const corpusRow = visibleRowsRef.current[row];
    if (!corpusRow) return;
    const glideRow = glideRowMapRef.current.get(corpusRow.rowIndex);
    setDescriptionHit({
      displayRow: row,
      descData: {
        type: GLIDE_DESC_CELL,
        sourceText: corpusRow.text,
        runs: glideRow?.descriptionRuns ?? (
          corpusRow.text.length > 0 ? [{ kind: 'text', text: corpusRow.text }] : []
        ),
      },
      anchor: resolveGlideCellScreenRect(
        gridRef,
        cell,
        eventBounds ?? { x: 0, y: 0, width: 0, height: 0 },
        containerRef.current,
      ),
    });
  }, [containerRef]);

  const openSegmentationHit = useCallback((cell: Item, eventBounds?: Rectangle) => {
    const [col, row] = cell;
    if (col !== CORPUS_GLIDE_COL_SEGMENTATION) return;
    const corpusRow = visibleRowsRef.current[row];
    if (!corpusRow) return;
    const glideRow = glideRowMapRef.current.get(corpusRow.rowIndex);
    setSegmentationHit({
      displayRow: row,
      chipData: {
        type: GLIDE_CHIP_CELL,
        sourceText: corpusRow.text,
        segments: glideRow?.segPaints ?? [],
        unmatched: glideRow?.segmentation?.unmatched ?? [],
      },
      anchor: resolveGlideCellScreenRect(
        gridRef,
        cell,
        eventBounds ?? { x: 0, y: 0, width: 0, height: 0 },
        containerRef.current,
      ),
    });
  }, [containerRef]);

  const onCellClicked = useCallback((cell: Item, event: CellClickedEventArgs) => {
    if (event.kind !== 'cell') return;
    const [col, displayRow] = cell;

    if (col === CORPUS_GLIDE_COL_EXTRA) {
      setDescriptionHit(null);
      setSegmentationHit(null);

      if (event.isDoubleClick) {
        logCorpusExtraDrop('extra.cell.doubleClick', {
          displayRow,
          rowIndex: visibleRowsRef.current[displayRow]?.rowIndex ?? null,
        });
        openExtraEditor(cell, event.bounds);
      } else {
        closeExtraEditor();
      }
      return;
    }

    if (col === CORPUS_GLIDE_COL_DESCRIPTION) {
      closeExtraEditor();
      setSegmentationHit(null);
      openDescriptionHit(cell, event.bounds);
      return;
    }

    if (col === CORPUS_GLIDE_COL_SEGMENTATION) {
      closeExtraEditor();
      setDescriptionHit(null);
      openSegmentationHit(cell, event.bounds);
      return;
    }

    closeExtraEditor();
    setDescriptionHit(null);
    setSegmentationHit(null);
    clearExtraSelection('click:otherColumn');
  }, [
    clearExtraSelection,
    closeExtraEditor,
    openDescriptionHit,
    openExtraEditor,
    openSegmentationHit,
  ]);

  const handleGridSelectionChange = useCallback((sel: GridSelection) => {
    setGridSelection(sel);
    const displayRows = extraColumnDisplayRowsFromGridSelection(sel, CORPUS_GLIDE_COL_EXTRA);
    if (displayRows.length > 0) {
      replaceExtraSelection(displayRows, visibleRowsRef.current);
    }
    logCorpusExtraDrop('extra.gridSelection.changed', {
      displayRows,
      focusCell: sel.current?.cell ?? null,
    });
  }, [replaceExtraSelection]);

  useEffect(() => {
    if (extraSelection.size === 0) {
      setGridSelection(EMPTY_GRID_SELECTION);
    }
  }, [extraSelection]);

  const descriptionRenderer = useMemo((): CustomRenderer<CustomCell> => ({
    ...glideDescriptionRenderer,
    draw: (args, cell) => {
      if (!isGlideDescCell(cell as CustomCell)) return;
      if (descriptionHitRef.current?.displayRow === args.row) {
        const { ctx, rect, theme } = args;
        ctx.fillStyle = theme.bgCell;
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        return;
      }
      drawDescriptionRuns(args, (cell as CustomCell<GlideDescCellData>).data);
    },
    onClick: (args) => {
      if (!isGlideDescCell(args.cell as CustomCell)) return;
      args.preventDefault();
    },
  }), []);

  const chipRendererBase = useCallback((
    hitRef: React.RefObject<{ displayRow: number } | null>,
  ): CustomRenderer<CustomCell>['draw'] => (args, cell) => {
    if (!isGlideChipCell(cell as CustomCell)) return;
    const { ctx, rect, theme } = args;
    if (hitRef.current?.displayRow === args.row) {
      ctx.fillStyle = theme.bgCell;
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      return;
    }
    drawGlideChipPills(args, (cell as CustomCell<GlideChipCellData>).data);
  }, []);

  const extraChipRenderer = useMemo(
    () => createExtraColumnRenderer(extraEditorDisplayRowRef, extraSelectionRef),
    [],
  );

  const segmentationChipRenderer = useMemo((): CustomRenderer<CustomCell> => ({
    ...glideChipRenderer,
    draw: chipRendererBase(segmentationHitRef),
    onClick: (args) => {
      if (!isGlideChipCell(args.cell as CustomCell)) return;
      args.preventDefault();
    },
  }), [chipRendererBase]);

  const prevExtraEditorRef = useRef(extraEditor);

  useEffect(() => {
    const prevDesc = prevDescriptionHitRef.current;
    const prevExtra = prevExtraEditorRef.current;
    const prevSeg = prevSegmentationHitRef.current;
    prevDescriptionHitRef.current = descriptionHit;
    prevSegmentationHitRef.current = segmentationHit;
    prevExtraEditorRef.current = extraEditor;

    const cells: Item[] = [];
    if (prevDesc) cells.push([CORPUS_GLIDE_COL_DESCRIPTION, prevDesc.displayRow]);
    if (descriptionHit) cells.push([CORPUS_GLIDE_COL_DESCRIPTION, descriptionHit.displayRow]);
    if (prevExtra) cells.push([CORPUS_GLIDE_COL_EXTRA, prevExtra.displayRow]);
    if (extraEditor) cells.push([CORPUS_GLIDE_COL_EXTRA, extraEditor.displayRow]);
    if (prevSeg) cells.push([CORPUS_GLIDE_COL_SEGMENTATION, prevSeg.displayRow]);
    if (segmentationHit) cells.push([CORPUS_GLIDE_COL_SEGMENTATION, segmentationHit.displayRow]);

    if (cells.length > 0) {
      gridRef.current?.updateCells(cells.map(([col, row]) => ({ cell: [col, row] })));
    }
  }, [descriptionHit, extraEditor, segmentationHit]);

  useEffect(() => {
    const rows = [...extraSelection];
    if (rows.length === 0) return;
    gridRef.current?.updateCells(
      rows.map((row) => ({ cell: [CORPUS_GLIDE_COL_EXTRA, row] })),
    );
  }, [extraSelection]);

  const customRenderers = useMemo(
    () => [descriptionRenderer, extraChipRenderer, segmentationChipRenderer],
    [descriptionRenderer, extraChipRenderer, segmentationChipRenderer],
  );

  const onVisibleRegionChanged = useCallback((range: Rectangle) => {
    setDescriptionHit(null);
    closeExtraEditor();
    setSegmentationHit(null);
    tabularGlideLogScrollRegion({
      rows: visibleRowsRef.current.length,
      cols: gridColumns.length,
      y: range.y,
      height: range.height,
    });
  }, [closeExtraEditor, gridColumns.length]);

  useEffect(() => {
    if (!gridReady || visibleRows.length === 0) return;
    gridRef.current?.updateCells(
      visibleRows.flatMap((_, displayRow) => ([
        { cell: [CORPUS_GLIDE_COL_EXTRA, displayRow] as Item },
        { cell: [CORPUS_GLIDE_COL_SEGMENTATION, displayRow] as Item },
      ])),
    );
  }, [extraAnnotations, gridReady, visibleRows, glideRowMap]);

  const handleGridClick = useCallback((e: React.MouseEvent) => {
    onClearSelectionClick(e);
  }, [onClearSelectionClick]);

  const handleClearExtraColumn = useCallback(() => {
    clearAllExtraAnnotations();
    clearExtraSelection('clear:header');
    closeExtraEditor();
  }, [clearAllExtraAnnotations, clearExtraSelection, closeExtraEditor]);

  const extraColumnHeaderLeft = columnWidths.index + columnWidths.description;
  const hasExtraAnnotations = extraAnnotations.size > 0;

  return (
    <div
      ref={containerRef}
      className="tabular-glide-grid tabular-glide-bench flex-1 min-h-0 min-w-0 relative"
      data-corpus-extra-drop-zone="true"
      style={{ height: '100%', width: '100%' }}
      onClick={handleGridClick}
      onDragOverCapture={handleDragOver}
      onDropCapture={handleDrop}
    >
      {gridReady ? (
        <DataEditor
          ref={gridRef}
          columns={gridColumns}
          rows={visibleRows.length}
          getCellContent={getCellContent}
          customRenderers={customRenderers}
          onCellClicked={onCellClicked}
          gridSelection={gridSelection}
          onGridSelectionChange={handleGridSelectionChange}
          rangeSelect="rect"
          rowSelect="none"
          columnSelect="none"
          onVisibleRegionChanged={onVisibleRegionChanged}
          rowHeight={getRowHeight}
          headerHeight={CORPUS_GLIDE_HEADER_HEIGHT}
          width={size.width}
          height={size.height}
          theme={TABULAR_GLIDE_THEME}
          drawFocusRing={false}
          smoothScrollX
          smoothScrollY
          experimental={{ scrollbarWidthOverride: 16 }}
        />
      ) : (
        <div className="flex h-full items-center justify-center font-mono text-xs text-emerald-400/35">
          Caricamento griglia…
        </div>
      )}
      {gridReady && (
        <CorpusExtraColumnHeaderClear
          leftPx={extraColumnHeaderLeft}
          widthPx={columnWidths.extra}
          headerHeightPx={CORPUS_GLIDE_HEADER_HEIGHT}
          hasAnnotations={hasExtraAnnotations}
          onClear={handleClearExtraColumn}
        />
      )}
      {descriptionHit && (
        <CorpusGlideDescriptionHitLayer
          descData={descriptionHit.descData}
          anchor={descriptionHit.anchor}
          onClose={closeDescriptionHit}
        />
      )}
      {extraEditor && (
        <CorpusExtraCellEditor
          rowIndex={extraEditor.rowIndex}
          chipData={extraEditor.chipData}
          anchor={extraEditor.anchor}
          onClose={closeExtraEditor}
        />
      )}
      {segmentationHit && (
        <CorpusGlideSegmentationHitLayer
          chipData={segmentationHit.chipData}
          anchor={segmentationHit.anchor}
          onClose={closeSegmentationHit}
        />
      )}
      {isCorpusExtraDropDebugEnabled() && dropDebugLine && (
        <div className="pointer-events-none absolute bottom-2 left-2 right-2 z-[9999] rounded border border-amber-400/50 bg-[#1a1408]/95 px-2 py-1 font-mono text-[10px] text-amber-100/90">
          [extra-drop debug] {dropDebugLine}
        </div>
      )}
    </div>
  );
});
