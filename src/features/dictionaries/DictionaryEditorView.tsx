/**
 * Single dictionary editor body — rendered inside nested Dizionari dock panels.
 */
import { useCallback } from 'react';
import { syncCategoriesWithTokens, removeTokenFromLayout } from '../../lib/dictionaryTree';
import { removeAlias, removeCanonicalToken } from '../../lib/tokenDictionary';
import { TokenTreeEditor } from '../../components/DocumentViewer/TokenTreeEditor';
import { useDocumentEditor } from '../document-editor/DocumentEditorContext';

export function DictionaryEditorView({ dictionaryId }: { dictionaryId: string }) {
  const { dicts } = useDocumentEditor();
  const meta = dicts.getDictionaryMeta(dictionaryId);
  const session = dicts.getSession(dictionaryId);

  const tokens = session?.tokens ?? [];
  const categories = session?.categories ?? [];

  const handleTokensChange = useCallback((next: typeof tokens) => {
    const synced = syncCategoriesWithTokens(categories, next);
    dicts.setSessionTokens(dictionaryId, next);
    dicts.setSessionCategories(dictionaryId, synced);
  }, [dicts, dictionaryId, categories]);

  const handleCategoriesChange = useCallback((next: typeof categories) => {
    dicts.setSessionCategories(dictionaryId, next);
  }, [dicts, dictionaryId]);

  const handleRemoveCanonical = useCallback((text: string) => {
    handleTokensChange(removeCanonicalToken(tokens, text));
    handleCategoriesChange(removeTokenFromLayout(categories, text));
  }, [tokens, categories, handleTokensChange, handleCategoriesChange]);

  const handleRemoveAlias = useCallback((text: string) => {
    handleTokensChange(removeAlias(tokens, text));
  }, [tokens, handleTokensChange]);

  if (!meta || !session) {
    return (
      <div className="flex items-center justify-center h-full font-mono text-xs text-emerald-300/85">
        Dizionario non disponibile
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#070d09]">
      <TokenTreeEditor
        tokens={tokens}
        categories={categories}
        onTokensChange={handleTokensChange}
        onCategoriesChange={handleCategoriesChange}
        onRemoveCanonical={handleRemoveCanonical}
        onRemoveAlias={handleRemoveAlias}
        showDictionaryHeader={false}
      />
    </div>
  );
}
