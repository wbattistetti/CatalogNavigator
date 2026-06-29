/**
 * Corpus extra-column multi-select — lives at document level (shared by grid + dictionary).
 */
import { useCallback, useRef, useState } from 'react';
import type { CorpusRow } from './corpusRowModel';
import {
  clearCorpusExtraDropSelection,
  setCorpusExtraDropSelection,
  getCorpusExtraDropTargetRowIndices,
} from '../../lib/corpusExtraDropSelectionStore';
import { logCorpusExtraDrop } from '../../lib/corpusExtraDropDebug';
import {
  applyExtraSelectionClick,
  type ExtraSelectionModifiers,
} from './corpusGlide/extra/corpusExtraSelectionLogic';

function displayRowsToRowIndices(
  displayRows: ReadonlySet<number>,
  visibleRows: readonly CorpusRow[],
): number[] {
  return [...displayRows]
    .map((row) => visibleRows[row]?.rowIndex)
    .filter((idx): idx is number => idx != null);
}

function syncDropSnapshot(rowIndices: readonly number[]) {
  return [...rowIndices];
}

export interface CorpusExtraColumnSelection {
  selectedRowIndices: ReadonlySet<number>;
  selectedDisplayRows: ReadonlySet<number>;
  selectExtraCell: (
    displayRow: number,
    visibleRows: readonly CorpusRow[],
    modifiers: ExtraSelectionModifiers,
  ) => void;
  replaceExtraSelection: (
    displayRows: readonly number[],
    visibleRows: readonly CorpusRow[],
  ) => void;
  clearExtraSelection: (reason?: string) => void;
  snapshotExtraSelectionForDrag: () => void;
  clearExtraDragSnapshot: () => void;
  resolveDropTargetRowIndices: () => readonly number[];
}

export function useCorpusExtraColumnSelection(): CorpusExtraColumnSelection {
  const [selectedRowIndices, setSelectedRowIndices] = useState<ReadonlySet<number>>(() => new Set());
  const [selectedDisplayRows, setSelectedDisplayRows] = useState<ReadonlySet<number>>(() => new Set());
  const selectedRowIndicesRef = useRef(selectedRowIndices);
  selectedRowIndicesRef.current = selectedRowIndices;
  const selectedDisplayRowsRef = useRef(selectedDisplayRows);
  selectedDisplayRowsRef.current = selectedDisplayRows;
  const anchorDisplayRowRef = useRef<number | null>(null);
  const dragSnapshotRowIndicesRef = useRef<readonly number[]>([]);

  const applySelection = useCallback((
    nextDisplay: ReadonlySet<number>,
    visibleRows: readonly CorpusRow[],
    anchor: number | null,
  ) => {
    anchorDisplayRowRef.current = anchor;
    const rowIndices = displayRowsToRowIndices(nextDisplay, visibleRows);
    const nextRowIndexSet = new Set(rowIndices);
    selectedRowIndicesRef.current = nextRowIndexSet;
    selectedDisplayRowsRef.current = nextDisplay;
    dragSnapshotRowIndicesRef.current = syncDropSnapshot(rowIndices);
    setCorpusExtraDropSelection([...nextDisplay], rowIndices);
    setSelectedDisplayRows(new Set(nextDisplay));
    setSelectedRowIndices(nextRowIndexSet);
    logCorpusExtraDrop('extra.selection.updated', {
      displayRows: [...nextDisplay],
      rowIndices,
      anchorDisplayRow: anchor,
      count: rowIndices.length,
    });
  }, []);

  const replaceExtraSelection = useCallback((
    displayRows: readonly number[],
    visibleRows: readonly CorpusRow[],
  ) => {
    const nextDisplay = new Set(displayRows);
    const anchor = displayRows.length > 0 ? displayRows[displayRows.length - 1]! : null;
    applySelection(nextDisplay, visibleRows, anchor);
  }, [applySelection]);

  const selectExtraCell = useCallback((
    displayRow: number,
    visibleRows: readonly CorpusRow[],
    modifiers: ExtraSelectionModifiers,
  ) => {
    const { selection: nextDisplay, anchor } = applyExtraSelectionClick(
      selectedDisplayRowsRef.current,
      displayRow,
      anchorDisplayRowRef.current,
      modifiers,
    );
    applySelection(nextDisplay, visibleRows, anchor);
    logCorpusExtraDrop('extra.selection', {
      displayRow,
      rowIndex: visibleRows[displayRow]?.rowIndex ?? null,
      ctrl: modifiers.ctrlKey || modifiers.metaKey,
      shift: modifiers.shiftKey,
    });
  }, [applySelection]);

  const clearExtraSelection = useCallback((reason = 'unknown') => {
    const prevRowIndices = [...selectedRowIndicesRef.current];
    const prevDisplayRows = [...selectedDisplayRowsRef.current];
    anchorDisplayRowRef.current = null;
    dragSnapshotRowIndicesRef.current = [];
    selectedRowIndicesRef.current = new Set();
    selectedDisplayRowsRef.current = new Set();
    clearCorpusExtraDropSelection();
    setSelectedDisplayRows(new Set());
    setSelectedRowIndices(new Set());
    logCorpusExtraDrop('extra.selection.cleared', {
      reason,
      prevRowIndices,
      prevDisplayRows,
    });
  }, []);

  const snapshotExtraSelectionForDrag = useCallback(() => {
    const fromStore = getCorpusExtraDropTargetRowIndices();
    const liveRowIndices = fromStore.length > 0
      ? [...fromStore]
      : [...selectedRowIndicesRef.current];
    const liveDisplayRows = [...selectedDisplayRowsRef.current];
    dragSnapshotRowIndicesRef.current = liveRowIndices;
    logCorpusExtraDrop('extra.selection.snapshot', {
      snapshotRowIndices: [...dragSnapshotRowIndicesRef.current],
      liveRowIndices,
      liveDisplayRows,
      storeRowIndices: [...fromStore],
      anchorDisplayRow: anchorDisplayRowRef.current,
      match: liveRowIndices.length === dragSnapshotRowIndicesRef.current.length
        && liveRowIndices.every((v, i) => v === dragSnapshotRowIndicesRef.current[i]),
    });
  }, []);

  const clearExtraDragSnapshot = useCallback(() => {
    if (dragSnapshotRowIndicesRef.current.length > 0) {
      logCorpusExtraDrop('extra.selection.snapshotCleared', {
        clearedRowIndices: [...dragSnapshotRowIndicesRef.current],
      });
    }
    dragSnapshotRowIndicesRef.current = [];
  }, []);

  const resolveDropTargetRowIndices = useCallback((): readonly number[] => {
    if (dragSnapshotRowIndicesRef.current.length > 0) return dragSnapshotRowIndicesRef.current;
    const fromStore = getCorpusExtraDropTargetRowIndices();
    if (fromStore.length > 0) return fromStore;
    return [...selectedRowIndicesRef.current];
  }, []);

  return {
    selectedRowIndices,
    selectedDisplayRows,
    selectExtraCell,
    replaceExtraSelection,
    clearExtraSelection,
    snapshotExtraSelectionForDrag,
    clearExtraDragSnapshot,
    resolveDropTargetRowIndices,
  };
}
