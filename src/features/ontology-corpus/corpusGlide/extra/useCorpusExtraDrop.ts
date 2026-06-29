/**
 * Unified drop handling for corpus extra column (pointer bridge + HTML5 DnD).
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { DataEditorRef } from '@glideapps/glide-data-grid';
import type { Item } from '@glideapps/glide-data-grid';
import { parseTokenDragPayloadFromDataTransfer, isTokenDragEvent } from '../../../../lib/dictionaryTokenDrag';
import { isEditorTabDragEvent } from '../../../document-editor/documentEditorSplitLayout';
import { registerCorpusExtraDropHandler } from '../../../../lib/corpusExtraDropBridge';
import {
  logCorpusExtraDrop,
  warnCorpusExtraDrop,
} from '../../../../lib/corpusExtraDropDebug';
import { resolveExtraDisplayRowAtClientPoint } from '../resolveGlideCellAtClientPoint';
import type { CorpusRow } from '../../corpusRowModel';
import { CORPUS_GLIDE_COL_EXTRA } from '../corpusGlideColumns';

export interface UseCorpusExtraDropOptions {
  gridRef: RefObject<DataEditorRef | null>;
  containerRef: RefObject<HTMLElement | null>;
  visibleRowsRef: RefObject<readonly CorpusRow[]>;
  addExtraTokens: (rowIndices: readonly number[], tokenTexts: readonly string[]) => void;
  resolveDropTargetRowIndices: () => readonly number[];
  onDropApplied?: () => void;
}

export function useCorpusExtraDrop({
  gridRef,
  containerRef,
  visibleRowsRef,
  addExtraTokens,
  resolveDropTargetRowIndices,
  onDropApplied,
}: UseCorpusExtraDropOptions) {
  const [dropDebugLine, setDropDebugLine] = useState<string | null>(null);
  const resolveDropTargetRowIndicesRef = useRef(resolveDropTargetRowIndices);
  resolveDropTargetRowIndicesRef.current = resolveDropTargetRowIndices;

  const resolveDropRowIndices = useCallback((clientX: number, clientY: number): number[] => {
    const snapshotRows = [...resolveDropTargetRowIndicesRef.current()];
    if (snapshotRows.length > 0) {
      logCorpusExtraDrop('drop.resolveRows', {
        branch: 'selection',
        rowIndices: snapshotRows,
        clientX,
        clientY,
      });
      return snapshotRows;
    }

    const displayRow = resolveExtraDisplayRowAtClientPoint(
      gridRef.current,
      clientX,
      clientY,
      visibleRowsRef.current.length,
      CORPUS_GLIDE_COL_EXTRA,
    );
    const fallbackRowIndex = displayRow != null
      ? visibleRowsRef.current[displayRow]?.rowIndex ?? null
      : null;
    logCorpusExtraDrop('drop.resolveRows', {
      branch: 'fallbackCellUnderPointer',
      displayRow,
      rowIndex: fallbackRowIndex,
      clientX,
      clientY,
    });
    if (fallbackRowIndex == null) return [];
    return [fallbackRowIndex];
  }, [gridRef, visibleRowsRef]);

  const isExtraDropTarget = useCallback((clientX: number, clientY: number): boolean => {
    if (resolveDropTargetRowIndicesRef.current().length > 0) {
      const container = containerRef.current;
      if (!container) return false;
      const rect = container.getBoundingClientRect();
      return (
        clientX >= rect.left
        && clientX <= rect.right
        && clientY >= rect.top
        && clientY <= rect.bottom
      );
    }
    return resolveExtraDisplayRowAtClientPoint(
      gridRef.current,
      clientX,
      clientY,
      visibleRowsRef.current.length,
      CORPUS_GLIDE_COL_EXTRA,
    ) != null;
  }, [containerRef, gridRef, visibleRowsRef]);

  const refreshExtraColumnCells = useCallback((rowIndices: readonly number[]) => {
    const cells = rowIndices.flatMap((rowIndex) => {
      const displayRow = visibleRowsRef.current.findIndex((r) => r.rowIndex === rowIndex);
      return displayRow >= 0 ? [{ cell: [CORPUS_GLIDE_COL_EXTRA, displayRow] as Item }] : [];
    });
    if (cells.length > 0) gridRef.current?.updateCells(cells);
  }, [gridRef, visibleRowsRef]);

  const applyExtraTokenDropAtRef = useRef(
    (_clientX: number, _clientY: number, _tokens: readonly string[]) => false,
  );

  applyExtraTokenDropAtRef.current = (clientX, clientY, tokens) => {
    const targetRows = resolveDropTargetRowIndicesRef.current();
    const snapshotRows = targetRows.length > 0 ? [...targetRows] : [];
    logCorpusExtraDrop('drop.attempt', {
      clientX,
      clientY,
      tokens: [...tokens],
      dropTargetRowIndices: snapshotRows,
      dropTargetCount: snapshotRows.length,
      visibleRowCount: visibleRowsRef.current.length,
    });

    if (!tokens.length) {
      warnCorpusExtraDrop('drop.rejected.noTokens');
      setDropDebugLine('Drop rifiutato: nessun token');
      return false;
    }

    if (!isExtraDropTarget(clientX, clientY)) {
      warnCorpusExtraDrop('drop.rejected.notOverTarget', {
        clientX,
        clientY,
        containerRect: containerRef.current?.getBoundingClientRect() ?? null,
        elementAtPoint: document.elementFromPoint(clientX, clientY)?.tagName ?? null,
      });
      setDropDebugLine('Drop rifiutato: puntatore fuori colonna extra');
      return false;
    }

    const rowIndices = resolveDropRowIndices(clientX, clientY);
    if (rowIndices.length === 0) {
      warnCorpusExtraDrop('drop.rejected.noRows', {
        dropTargetRowIndices: [...targetRows],
        displayRow: resolveExtraDisplayRowAtClientPoint(
          gridRef.current,
          clientX,
          clientY,
          visibleRowsRef.current.length,
          CORPUS_GLIDE_COL_EXTRA,
        ),
      });
      setDropDebugLine('Drop rifiutato: nessuna riga extra selezionata');
      return false;
    }

    logCorpusExtraDrop('drop.accepted', {
      tokens: [...tokens],
      rowIndices,
      rowCount: rowIndices.length,
    });
    addExtraTokens(rowIndices, tokens);
    refreshExtraColumnCells(rowIndices);
    onDropApplied?.();
    setDropDebugLine(`OK: ${tokens.join(', ')} → righe ${rowIndices.join(', ')}`);
    return true;
  };

  useEffect(() => {
    registerCorpusExtraDropHandler((clientX, clientY, tokens) =>
      applyExtraTokenDropAtRef.current(clientX, clientY, tokens),
    );
    return () => registerCorpusExtraDropHandler(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (isEditorTabDragEvent(e)) return;
    if (!isTokenDragEvent(e)) return;
    if (!isExtraDropTarget(e.clientX, e.clientY)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
  }, [isExtraDropTarget]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    if (isEditorTabDragEvent(e)) return;
    const tokens = parseTokenDragPayloadFromDataTransfer(e.dataTransfer);
    if (!tokens?.length) return;
    if (applyExtraTokenDropAtRef.current(e.clientX, e.clientY, tokens)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  return {
    dropDebugLine,
    handleDragOver,
    handleDrop,
  };
}
