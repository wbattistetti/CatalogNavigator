/**
 * Extra column annotations and multi-select for corpus rows (extends ontology paths).
 */
import { createContext, useContext, type ReactNode } from 'react';
import type { CorpusExtraAnnotations } from '../../lib/corpusExtraAnnotations';
import type { CorpusRow } from './corpusRowModel';
import type { ExtraSelectionModifiers } from './corpusGlide/extra/corpusExtraSelectionLogic';

export interface OntologyCorpusExtraContextValue {
  extraAnnotations: CorpusExtraAnnotations;
  addExtraTokens: (rowIndices: readonly number[], tokenTexts: readonly string[]) => void;
  removeExtraTokenAt: (rowIndex: number, tokenText: string, occurrenceIndex0Based?: number) => void;
  clearAllExtraAnnotations: () => void;
  lookupExtra: (rowIndex: number) => readonly string[];
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

const OntologyCorpusExtraContext = createContext<OntologyCorpusExtraContextValue | null>(null);

export function OntologyCorpusExtraProvider({
  value,
  children,
}: {
  value: OntologyCorpusExtraContextValue;
  children: ReactNode;
}) {
  return (
    <OntologyCorpusExtraContext.Provider value={value}>{children}</OntologyCorpusExtraContext.Provider>
  );
}

export function useOntologyCorpusExtra(): OntologyCorpusExtraContextValue {
  const ctx = useContext(OntologyCorpusExtraContext);
  if (!ctx) throw new Error('useOntologyCorpusExtra requires OntologyCorpusExtraProvider');
  return ctx;
}

/** Returns null when rendered outside OntologyCorpusExtraProvider. */
export function useOntologyCorpusExtraOptional(): OntologyCorpusExtraContextValue | null {
  return useContext(OntologyCorpusExtraContext);
}
