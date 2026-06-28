/**
 * Glide grid for ontology corpus: description + segmentation chips (canvas, precalculated).
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
  type CustomCell,
  type CustomRenderer,
  type DataEditorRef,
  type GridCell,
  type GridColumn,
  type GridMouseEventArgs,
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
  glideDescriptionRenderer,
  isGlideDescCell,
} from '../../../lib/glideDescriptionRenderer';
import type { CorpusRow } from '../corpusRowModel';
import type { CorpusGlideRow } from './buildCorpusGlideRows';
import { CorpusGlideDescriptionEditor } from './CorpusGlideDescriptionEditor';
import { CorpusGlideSegmentationHitLayer } from './CorpusGlideSegmentationEditor';
import {
  corpusGlideColumnWidths,
  estimateCorpusGlideRowHeight,
} from '../../../lib/glideWrapLayout';
import type { GlideChipCellData } from '../../../lib/glideChipRenderer';
import { resolveGlideCellScreenRect, type GlideCellScreenRect } from './resolveGlideCellScreenRect';

const CORPUS_GLIDE_MIN_ROW_HEIGHT = 48;

export const CORPUS_GLIDE_COL_INDEX = 0;
export const CORPUS_GLIDE_COL_DESCRIPTION = 1;
export const CORPUS_GLIDE_COL_SEGMENTATION = 2;

const CORPUS_COLUMNS: GridColumn[] = [
  { title: '#', id: 'index', width: 56 },
  { title: 'descrizione', id: 'description', width: 420, grow: 1 },
  { title: 'segmentazione', id: 'segmentation', width: 360, grow: 1 },
];

export interface CorpusGlideGridHandle {
  scrollToTop: () => void;
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
  const { containerRef, size } = useContainerSize();
  const gridRef = useRef<DataEditorRef>(null);
  const [segmentationHit, setSegmentationHit] = useState<SegmentationHitState | null>(null);
  const segmentationHitRef = useRef<SegmentationHitState | null>(null);
  const prevSegmentationHitRef = useRef<SegmentationHitState | null>(null);
  segmentationHitRef.current = segmentationHit;

  const visibleRowsRef = useRef(visibleRows);
  visibleRowsRef.current = visibleRows;
  const glideRowMapRef = useRef(glideRowMap);
  glideRowMapRef.current = glideRowMap;

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

  const provideEditor = useCallback((cell: GridCell) => {
    if (cell.kind !== GridCellKind.Custom) return undefined;
    const custom = cell as CustomCell;
    if (isGlideDescCell(custom)) {
      return { editor: CorpusGlideDescriptionEditor, disablePadding: true };
    }
    return undefined;
  }, []);

  const gridReady = size.width > 0 && size.height > 0;
  const columnWidths = useMemo(
    () => corpusGlideColumnWidths(size.width),
    [size.width],
  );

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
      unmatchedCount: glideRow?.segmentation?.unmatched.length ?? 0,
      descriptionColWidth: columnWidths.description,
      segmentationColWidth: columnWidths.segmentation,
      minHeight: CORPUS_GLIDE_MIN_ROW_HEIGHT,
    });
  }, [columnWidths.description, columnWidths.segmentation]);

  useEffect(() => {
    if (!gridReady) return;
    tabularGlideLogMount('corpus-glide-ready', {
      width: size.width,
      height: size.height,
      rows: visibleRows.length,
      cols: CORPUS_COLUMNS.length,
    });
  }, [gridReady, size.width, size.height, visibleRows.length]);

  const closeSegmentationHit = useCallback(() => {
    setSegmentationHit(null);
  }, []);

  const openSegmentationHit = useCallback((cell: Item, eventBounds?: Rectangle) => {
    const [col, row] = cell;
    if (col !== CORPUS_GLIDE_COL_SEGMENTATION) return;

    const corpusRow = visibleRowsRef.current[row];
    if (!corpusRow) return;

    const glideRow = glideRowMapRef.current.get(corpusRow.rowIndex);
    const next: SegmentationHitState = {
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
    };

    setSegmentationHit((prev) => {
      if (
        prev?.displayRow === next.displayRow
        && prev.chipData.sourceText === next.chipData.sourceText
      ) {
        return prev;
      }
      return next;
    });
  }, [containerRef]);

  const segmentationChipRenderer = useMemo((): CustomRenderer<CustomCell> => ({
    ...glideChipRenderer,
    draw: (args, cell) => {
      if (!isGlideChipCell(cell as CustomCell)) return;
      const hit = segmentationHitRef.current;
      if (hit?.displayRow === args.row) {
        const { ctx, rect, theme } = args;
        ctx.fillStyle = theme.bgCell;
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        return;
      }
      drawGlideChipPills(args, (cell as CustomCell<GlideChipCellData>).data);
    },
    onClick: (args) => {
      if (!isGlideChipCell(args.cell as CustomCell)) return;
      args.preventDefault();
      openSegmentationHit(args.location, args.bounds);
    },
  }), [openSegmentationHit]);

  const onItemHovered = useCallback((args: GridMouseEventArgs) => {
    if (args.kind !== 'cell') return;
    const [col] = args.location;
    if (col !== CORPUS_GLIDE_COL_SEGMENTATION) {
      setSegmentationHit(null);
      return;
    }
    openSegmentationHit(args.location, args.bounds);
  }, [openSegmentationHit]);

  useEffect(() => {
    const prev = prevSegmentationHitRef.current;
    prevSegmentationHitRef.current = segmentationHit;
    const cells: Item[] = [];
    if (prev) cells.push([CORPUS_GLIDE_COL_SEGMENTATION, prev.displayRow]);
    if (segmentationHit) cells.push([CORPUS_GLIDE_COL_SEGMENTATION, segmentationHit.displayRow]);
    if (cells.length > 0) {
      gridRef.current?.updateCells(cells.map(([col, row]) => ({ cell: [col, row] })));
    }
  }, [segmentationHit]);

  const customRenderers = useMemo(
    () => [glideDescriptionRenderer, segmentationChipRenderer],
    [segmentationChipRenderer],
  );

  const onVisibleRegionChanged = useCallback((range: Rectangle) => {
    setSegmentationHit(null);
    tabularGlideLogScrollRegion({
      rows: visibleRowsRef.current.length,
      cols: CORPUS_COLUMNS.length,
      y: range.y,
      height: range.height,
    });
  }, []);

  const handleGridClick = useCallback((e: React.MouseEvent) => {
    onClearSelectionClick(e);
  }, [onClearSelectionClick]);

  return (
    <div
      ref={containerRef}
      className="tabular-glide-grid tabular-glide-bench flex-1 min-h-0 min-w-0"
      style={{ height: '100%', width: '100%' }}
      onClick={handleGridClick}
    >
      {gridReady ? (
        <DataEditor
          ref={gridRef}
          columns={CORPUS_COLUMNS}
          rows={visibleRows.length}
          getCellContent={getCellContent}
          provideEditor={provideEditor}
          customRenderers={customRenderers}
          onItemHovered={onItemHovered}
          onVisibleRegionChanged={onVisibleRegionChanged}
          getRowHeight={getRowHeight}
          rowHeight={CORPUS_GLIDE_MIN_ROW_HEIGHT}
          headerHeight={36}
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
      {segmentationHit && (
        <CorpusGlideSegmentationHitLayer
          chipData={segmentationHit.chipData}
          anchor={segmentationHit.anchor}
          onClose={closeSegmentationHit}
        />
      )}
    </div>
  );
});
