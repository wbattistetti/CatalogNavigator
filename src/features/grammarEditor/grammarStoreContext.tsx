/**
 * React context provider for per-instance grammar editor store.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { StoreApi } from 'zustand/vanilla';
import type { GrammarGraph } from '../../lib/grammarGraph/grammarGraphTypes';
import { createGrammarEditorStore, type GrammarEditorStore } from './grammarStore';

const GrammarEditorStoreContext = createContext<StoreApi<GrammarEditorStore> | null>(null);

export function GrammarEditorStoreProvider({
  grammarKey,
  initialGrammar,
  children,
}: {
  grammarKey: string;
  initialGrammar: GrammarGraph;
  children: ReactNode;
}) {
  const store = useMemo(
    () => createGrammarEditorStore(initialGrammar),
    [grammarKey],
  );
  return (
    <GrammarEditorStoreContext.Provider value={store}>
      {children}
    </GrammarEditorStoreContext.Provider>
  );
}

export function useGrammarEditorStore<T>(selector: (s: GrammarEditorStore) => T): T {
  const store = useContext(GrammarEditorStoreContext);
  if (!store) throw new Error('useGrammarEditorStore requires GrammarEditorStoreProvider');
  return useStore(store, selector);
}

export function useGrammarEditorStoreApi(): StoreApi<GrammarEditorStore> {
  const store = useContext(GrammarEditorStoreContext);
  if (!store) throw new Error('useGrammarEditorStoreApi requires GrammarEditorStoreProvider');
  return store;
}
