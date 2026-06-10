/**
 * Stable corpus chip interaction handlers (selection state lives in dictionarySelectionStore).
 */
import { createContext, useContext, type ReactNode } from 'react';

export interface CorpusChipActions {
  editableCanonicalSet: ReadonlySet<string>;
  onChipClick: (e: React.MouseEvent, canonical: string) => void;
  onChipMouseDown: (e: React.MouseEvent, canonical: string) => void;
}

const CorpusChipActionsContext = createContext<CorpusChipActions | null>(null);

export function CorpusChipActionsProvider({
  value,
  children,
}: {
  value: CorpusChipActions;
  children: ReactNode;
}) {
  return (
    <CorpusChipActionsContext.Provider value={value}>
      {children}
    </CorpusChipActionsContext.Provider>
  );
}

export function useCorpusChipActions(): CorpusChipActions {
  const ctx = useContext(CorpusChipActionsContext);
  if (!ctx) {
    throw new Error('useCorpusChipActions must be used within CorpusChipActionsProvider');
  }
  return ctx;
}
