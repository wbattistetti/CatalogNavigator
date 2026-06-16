/**
 * Runs AI token categorization on the active project dictionary and applies results directly.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { buildCategorizeTokensSnapshot, extractDescriptions } from '../../lib/categorizeTokensContext';
import { applyCategorizeSuggestions } from '../../lib/categorizeTokensApply';
import { runCategorizeTokens } from '../../lib/runCategorizeTokens';
import { useDocumentEditorController } from '../document-editor/DocumentEditorContext';

export const CATEGORIZE_WAIT_LABEL =
  'Per favore, attendi, sto vedendo come categorizzare i token...';

export function useCategorizeTokens() {
  const { content, doc, dicts } = useDocumentEditorController();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const dictionaryId = useMemo(
    () => dicts.projectDictionaryId,
    [dicts.projectDictionaryId],
  );

  const descriptions = useMemo(() => {
    if (!content.tabular) return [];
    return extractDescriptions(
      content.tabular.headers,
      content.tabular.rows,
      doc.column_roles ?? {},
    );
  }, [content.tabular, doc.column_roles]);

  const canCategorize = useMemo(() => {
    if (!dictionaryId || !content.tabular || descriptions.length === 0) return false;
    const session = dicts.getSession(dictionaryId);
    if (!session) return false;
    if (session.categories.length === 0) return false;
    const uncategorized = session.tokens.filter(
      (t) => !t.aliasOf && !session.categories.some((c) => c.tokenTexts.includes(t.text)),
    );
    return uncategorized.length > 0;
  }, [dictionaryId, content.tabular, descriptions.length, dicts]);

  const startCategorize = useCallback(async () => {
    if (!dictionaryId) return;
    const session = dicts.getSession(dictionaryId);
    if (!session) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setGenerating(true);
    setError(null);

    const snapshot = buildCategorizeTokensSnapshot(
      session.tokens,
      session.categories,
      descriptions,
    );

    if (snapshot.uncategorized.length === 0) {
      setError('Nessun token in «no category» da assegnare');
      setGenerating(false);
      return;
    }
    if (snapshot.catalogation.length === 0) {
      setError('Crea almeno una categoria prima di categorizzare');
      setGenerating(false);
      return;
    }

    try {
      const result = await runCategorizeTokens({
        tokens: session.tokens,
        categories: session.categories,
        descriptions,
      }, controller.signal);

      if (result.suggestions.length === 0) {
        setError('Nessuna assegnazione proposta: i token restano in no category');
        return;
      }

      const nextCategories = applyCategorizeSuggestions(
        session.categories,
        session.tokens,
        result.suggestions,
      );
      dicts.setSessionCategories(dictionaryId, nextCategories);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Categorizzazione fallita');
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  }, [dictionaryId, descriptions, dicts]);

  return {
    canCategorize,
    generating,
    error,
    startCategorize,
  };
}
