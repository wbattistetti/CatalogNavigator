/**
 * Promote-to-library state and handler for a project-scoped dictionary editor.
 */
import { useCallback, useMemo, useState } from 'react';
import { useDocumentEditorController } from '../document-editor/DocumentEditorContext';
import type { SaveProjectToLibraryInput } from './SaveProjectToLibraryPanel';

export function usePromoteProjectToLibrary(dictionaryId: string | null) {
  const { doc, dicts } = useDocumentEditorController();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = dictionaryId ? dicts.getDictionaryMeta(dictionaryId) : null;
  const session = dictionaryId ? dicts.getSession(dictionaryId) : null;
  const tokenCount = session?.tokens.filter((t) => !t.aliasOf).length ?? 0;

  const suggestedName = useMemo(() => {
    const base = doc.name.replace(/\.[^.]+$/, '').trim();
    return base || 'Dizionario';
  }, [doc.name]);

  const promote = useCallback(async (input: SaveProjectToLibraryInput): Promise<boolean> => {
    if (!dictionaryId) return false;
    setBusy(true);
    setError(null);
    try {
      await dicts.promoteDictionaryToLibrary(dictionaryId, input);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Promozione fallita');
      return false;
    } finally {
      setBusy(false);
    }
  }, [dictionaryId, dicts]);

  return {
    meta,
    tokenCount,
    suggestedName,
    busy: busy || (dictionaryId != null && dicts.savingDictionaryId === dictionaryId),
    error,
    promote,
  };
}
