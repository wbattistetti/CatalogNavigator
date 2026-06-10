/**
 * Resets dictionary selection store when the active document changes.
 */
import { useEffect, type ReactNode } from 'react';
import { resetDictionarySelection } from './dictionarySelectionStore';

export function DictionarySelectionProvider({
  docId,
  children,
}: {
  docId: string;
  children: ReactNode;
}) {
  useEffect(() => {
    resetDictionarySelection();
  }, [docId]);

  return children;
}
