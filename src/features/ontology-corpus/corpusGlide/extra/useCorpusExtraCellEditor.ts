/**
 * Optional single-cell editor overlay for corpus extra column (chip removal).
 */
import { useCallback, useRef, useState, type RefObject } from 'react';
import type { DataEditorRef, Item, Rectangle } from '@glideapps/glide-data-grid';
import { GLIDE_CHIP_CELL } from '../../../../lib/glideChipRenderer';
import type { GlideChipCellData } from '../../../../lib/glideChipRenderer';
import type { CorpusRow } from '../../corpusRowModel';
import type { CorpusGlideRow } from '../buildCorpusGlideRows';
import { resolveGlideCellScreenRect, type GlideCellScreenRect } from '../resolveGlideCellScreenRect';
import { CORPUS_GLIDE_COL_EXTRA } from '../corpusGlideColumns';

export interface ExtraCellEditorState {
  displayRow: number;
  rowIndex: number;
  chipData: GlideChipCellData;
  anchor: GlideCellScreenRect;
}

export function useCorpusExtraCellEditor(
  gridRef: RefObject<DataEditorRef | null>,
  containerRef: RefObject<HTMLElement | null>,
  visibleRowsRef: RefObject<readonly CorpusRow[]>,
  glideRowMapRef: RefObject<ReadonlyMap<number, CorpusGlideRow>>,
) {
  const [editor, setEditor] = useState<ExtraCellEditorState | null>(null);
  const editorRef = useRef<ExtraCellEditorState | null>(null);
  editorRef.current = editor;

  const open = useCallback((cell: Item, eventBounds?: Rectangle) => {
    const [col, displayRow] = cell;
    if (col !== CORPUS_GLIDE_COL_EXTRA) return;
    const corpusRow = visibleRowsRef.current[displayRow];
    if (!corpusRow) return;
    const glideRow = glideRowMapRef.current.get(corpusRow.rowIndex);
    setEditor({
      displayRow,
      rowIndex: corpusRow.rowIndex,
      chipData: {
        type: GLIDE_CHIP_CELL,
        sourceText: corpusRow.text,
        segments: glideRow?.extraPaints ?? [],
        unmatched: [],
      },
      anchor: resolveGlideCellScreenRect(
        gridRef,
        cell,
        eventBounds ?? { x: 0, y: 0, width: 0, height: 0 },
        containerRef.current,
      ),
    });
  }, [containerRef, glideRowMapRef, gridRef, visibleRowsRef]);

  const close = useCallback(() => setEditor(null), []);

  return { editor, editorRef, open, close };
}
