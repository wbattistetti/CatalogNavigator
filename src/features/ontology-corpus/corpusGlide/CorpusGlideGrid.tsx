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
} from 'react';
import {
  DataEditor,
  GridCellKind,
  type CustomCell,
  type DataEditorRef,
  type GridCell,
  type GridColumn,
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
import { CorpusGlideSegmentationEditor } from './CorpusGlideSegmentationEditor';
import {
  corpusGlideColumnWidths,
  estimateCorpusGlideRowHeight,
} from '../../../lib/glideWrapLayout';

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
      const unmatched = glideRow?.segmentation.unmatched ?? [];
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
    if (isGlideChipCell(custom)) {
      return { editor: CorpusGlideSegmentationEditor, disablePadding: true };
    }
    return undefined;
  }, []);

  const customRenderers = useMemo(
    () => [glideDescriptionRenderer, glideChipRenderer],
    [],
  );

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
      unmatchedCount: glideRow?.segmentation.unmatched.length ?? 0,
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

  const onVisibleRegionChanged = useCallback((range: Rectangle) => {
    tabularGlideLogScrollRegion({
      rows: visibleRowsRef.current.length,
      cols: CORPUS_COLUMNS.length,
      y: range.y,
      height: range.height,
    });
  }, []);

  return (
    <div
      ref={containerRef}
      className="tabular-glide-grid tabular-glide-bench flex-1 min-h-0 min-w-0"
      style={{ height: '100%', width: '100%' }}
      onClick={onClearSelectionClick}
    >
      {gridReady ? (
        <DataEditor
          ref={gridRef}
          columns={CORPUS_COLUMNS}
          rows={visibleRows.length}
          getCellContent={getCellContent}
          provideEditor={provideEditor}
          customRenderers={customRenderers}
          onVisibleRegionChanged={onVisibleRegionChanged}
          getRowHeight={getRowHeight}
          rowHeight={CORPUS_GLIDE_MIN_ROW_HEIGHT}
          headerHeight={36}
          width={size.width}
          height={size.height}
          theme={TABULAR_GLIDE_THEME}
          smoothScrollX
          smoothScrollY
          experimental={{ scrollbarWidthOverride: 16 }}
        />
      ) : (
        <div className="flex h-full items-center justify-center font-mono text-xs text-emerald-400/35">
          Caricamento griglia…
        </div>
      )}
    </div>
  );
});
