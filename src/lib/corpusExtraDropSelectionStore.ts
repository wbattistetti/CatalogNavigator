/**
 * Synchronous extra-column drop targets — survives grid remounts and React timing gaps.
 */
import { logCorpusExtraDrop } from './corpusExtraDropDebug';

let dropTargetRowIndices: readonly number[] = [];
let dropTargetDisplayRows: readonly number[] = [];

export function setCorpusExtraDropSelection(
  displayRows: readonly number[],
  rowIndices: readonly number[],
): void {
  dropTargetDisplayRows = [...displayRows];
  dropTargetRowIndices = [...rowIndices];
  logCorpusExtraDrop('extra.dropSelection.storeUpdated', {
    displayRows: [...dropTargetDisplayRows],
    rowIndices: [...dropTargetRowIndices],
    count: dropTargetRowIndices.length,
  });
}

export function getCorpusExtraDropTargetRowIndices(): readonly number[] {
  return dropTargetRowIndices;
}

export function getCorpusExtraDropTargetDisplayRows(): readonly number[] {
  return dropTargetDisplayRows;
}

export function clearCorpusExtraDropSelection(): void {
  dropTargetDisplayRows = [];
  dropTargetRowIndices = [];
}
