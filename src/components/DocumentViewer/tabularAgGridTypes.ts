/**
 * Shared types for AG Grid tabular preview.
 */

export interface TabularAgRow {
  __sourceIndex: number;
}

export interface TabularAgGridContext {
  onDeleteRow: (sourceRowIndex: number) => void;
}

/** Lightweight row handle — cell values resolved via valueGetter. */
export function toTabularAgRowHandle(sourceIndex: number): TabularAgRow {
  return { __sourceIndex: sourceIndex };
}

export function columnField(sourceColIndex: number): `c${number}` {
  return `c${sourceColIndex}`;
}

export function buildTabularAgRowHandles(sourceIndices: readonly number[]): TabularAgRow[] {
  const handles = new Array<TabularAgRow>(sourceIndices.length);
  for (let i = 0; i < sourceIndices.length; i++) {
    handles[i] = toTabularAgRowHandle(sourceIndices[i]!);
  }
  return handles;
}

export function buildAllTabularAgRowHandles(rowCount: number): TabularAgRow[] {
  const handles = new Array<TabularAgRow>(rowCount);
  for (let i = 0; i < rowCount; i++) {
    handles[i] = toTabularAgRowHandle(i);
  }
  return handles;
}
