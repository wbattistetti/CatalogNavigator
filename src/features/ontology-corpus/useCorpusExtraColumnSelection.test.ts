import { describe, expect, it } from 'vitest';
import { applyExtraSelectionClick } from './corpusGlide/extra/corpusExtraSelectionLogic';
import type { CorpusRow } from './corpusRowModel';

const visibleRows: CorpusRow[] = [
  { rowIndex: 10, text: 'a' },
  { rowIndex: 11, text: 'b' },
  { rowIndex: 12, text: 'c' },
  { rowIndex: 13, text: 'd' },
  { rowIndex: 14, text: 'e' },
];

function displayRowsToRowIndices(
  displayRows: ReadonlySet<number>,
  rows: readonly CorpusRow[],
): number[] {
  return [...displayRows]
    .map((row) => rows[row]?.rowIndex)
    .filter((idx): idx is number => idx != null);
}

describe('corpus extra column selection mapping', () => {
  it('maps a shift-selected display range to corpus row indices', () => {
    let displayRows = new Set<number>();
    let anchor: number | null = null;

    ({ selection: displayRows, anchor } = applyExtraSelectionClick(
      displayRows,
      0,
      anchor,
      { shiftKey: false, ctrlKey: false, metaKey: false },
    ));

    ({ selection: displayRows, anchor } = applyExtraSelectionClick(
      displayRows,
      4,
      anchor,
      { shiftKey: true, ctrlKey: false, metaKey: false },
    ));

    expect(displayRowsToRowIndices(displayRows, visibleRows)).toEqual([10, 11, 12, 13, 14]);
  });
});
