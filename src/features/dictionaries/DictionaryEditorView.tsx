/**
 * Single dictionary editor body — rendered inside nested Dizionari dock panels.
 */
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { MoveCategoryToLibraryDialog } from './MoveCategoryToLibraryDialog';
import { syncCategoriesWithTokens, removeTokenFromLayout } from '../../lib/dictionaryTree';
import { addAlias, removeAlias, removeCanonicalToken } from '../../lib/tokenDictionary';
import { TokenTreeEditor } from '../../components/DocumentViewer/TokenTreeEditor';
import { CategoryGrammarSidePanel } from '../../components/DocumentViewer/CategoryGrammarSidePanel';
import type { GrammarEditorHandle } from '../../components/DocumentViewer/InlineGrammarEditor';
import type { GrammarEntry } from '../../hooks/useAnalysis';
import { getStoredCategoryGrammar, setCategoryGrammar } from '../../lib/categoryGrammar';
import {
  useDictionaryCatalog,
  useDictionarySessionActions,
  useDocumentEditorDictionaryNav,
} from '../document-editor/DocumentEditorContext';
import { useDictionarySession } from '../../hooks/useDictionarySession';
export const DictionaryEditorView = memo(function DictionaryEditorView({ dictionaryId }: { dictionaryId: string }) {
  const catalog = useDictionaryCatalog();
  const { setSessionTokens, setSessionCategories } = useDictionarySessionActions();
  const {
    dictionaryTreeFocus,
    clearDictionaryTreeFocus,
    dictionaryAliasPick,
    cancelDictionaryAliasPick,
  } = useDocumentEditorDictionaryNav();
  const meta = catalog.getDictionaryMeta(dictionaryId);
  const session = useDictionarySession(dictionaryId);

  const [grammarPanelOpen, setGrammarPanelOpen] = useState(false);
  const [grammarEditCategoryId, setGrammarEditCategoryId] = useState<string | null>(null);
  const [moveCategory, setMoveCategory] = useState<{
    id: string;
    name: string;
    tokenCount: number;
  } | null>(null);
  const [moveBusy, setMoveBusy] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const grammarEditorRef = useRef<GrammarEditorHandle>(null);

  const libraryDictionaries = useMemo(
    () => catalog.available.filter((d) => d.scope === 'library'),
    [catalog.available],
  );

  const tokens = session?.tokens ?? [];
  const categories = session?.categories ?? [];

  const focusTokenText = useMemo(
    () => (dictionaryTreeFocus?.dictionaryId === dictionaryId
      ? dictionaryTreeFocus.tokenText
      : null),
    [dictionaryId, dictionaryTreeFocus],
  );

  const aliasPickActive = dictionaryAliasPick?.dictionaryId === dictionaryId;
  const aliasPickPhrase = aliasPickActive ? dictionaryAliasPick?.normalizedPhrase ?? null : null;

  const handleTokensChange = useCallback((next: typeof tokens) => {
    const synced = syncCategoriesWithTokens(categories, next);
    setSessionTokens(dictionaryId, next);
    setSessionCategories(dictionaryId, synced);
  }, [setSessionTokens, setSessionCategories, dictionaryId, categories]);

  const handleCategoriesChange = useCallback((next: typeof categories) => {
    setSessionCategories(dictionaryId, next);
  }, [setSessionCategories, dictionaryId]);

  const handleRemoveCanonical = useCallback((text: string) => {
    handleTokensChange(removeCanonicalToken(tokens, text));
    handleCategoriesChange(removeTokenFromLayout(categories, text));
  }, [tokens, categories, handleTokensChange, handleCategoriesChange]);

  const handleRemoveAlias = useCallback((text: string) => {
    handleTokensChange(removeAlias(tokens, text));
  }, [tokens, handleTokensChange]);

  const flushGrammarEditor = useCallback(() => {
    grammarEditorRef.current?.flushSave();
  }, []);

  const handleToggleGrammarPanel = useCallback(() => {
    if (grammarPanelOpen) {
      flushGrammarEditor();
      setGrammarEditCategoryId(null);
      setGrammarPanelOpen(false);
      return;
    }
    setGrammarPanelOpen(true);
  }, [flushGrammarEditor, grammarPanelOpen]);

  const handleGrammarEditCategoryChange = useCallback((newCategoryId: string | null) => {
    if (newCategoryId === grammarEditCategoryId) return;
    flushGrammarEditor();
    setGrammarEditCategoryId(newCategoryId);
  }, [flushGrammarEditor, grammarEditCategoryId]);

  const handleCategoryGrammarSave = useCallback((grammar: GrammarEntry) => {
    if (!grammarEditCategoryId) return;
    handleCategoriesChange(setCategoryGrammar(categories, grammarEditCategoryId, grammar));
  }, [grammarEditCategoryId, handleCategoriesChange, categories]);

  const handleMoveCategoryToLibrary = useCallback((
    categoryId: string,
    categoryName: string,
    tokenCount: number,
  ) => {
    setMoveError(null);
    setMoveCategory({ id: categoryId, name: categoryName, tokenCount });
  }, []);

  const handleConfirmMoveCategory = useCallback(async (
    target: { mode: 'new'; name: string } | { mode: 'existing'; dictionaryId: string },
  ) => {
    if (!moveCategory) return;
    setMoveBusy(true);
    setMoveError(null);
    try {
      await catalog.moveCategoryToLibrary(dictionaryId, moveCategory.id, target);
      setMoveCategory(null);
    } catch (err) {
      setMoveError(err instanceof Error ? err.message : 'Spostamento fallito');
    } finally {
      setMoveBusy(false);
    }
  }, [catalog, dictionaryId, moveCategory]);

  const handleAliasTargetPick = useCallback((canonicalText: string) => {
    if (!dictionaryAliasPick || dictionaryAliasPick.dictionaryId !== dictionaryId) return;
    try {
      handleTokensChange(addAlias(
        tokens,
        dictionaryAliasPick.phrase,
        canonicalText,
        dictionaryAliasPick.range,
      ));
    } catch {
      /* invalid */
    }
    cancelDictionaryAliasPick();
    window.getSelection()?.removeAllRanges();
  }, [cancelDictionaryAliasPick, dictionaryAliasPick, dictionaryId, handleTokensChange, tokens]);

  if (!meta || !session) {
    return (
      <div className="flex items-center justify-center h-full font-mono text-xs text-emerald-300/85">
        Dizionario non disponibile
      </div>
    );
  }

  const grammarEditCategory = grammarEditCategoryId
    ? categories.find((cat) => cat.id === grammarEditCategoryId) ?? null
    : null;

  const grammarForPanel = grammarEditCategoryId
    ? getStoredCategoryGrammar(grammarEditCategoryId, categories)
    : null;

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#070d09]">
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 min-h-0">
          <TokenTreeEditor
            tokens={tokens}
            categories={categories}
            onTokensChange={handleTokensChange}
            onCategoriesChange={handleCategoriesChange}
            onRemoveCanonical={handleRemoveCanonical}
            onRemoveAlias={handleRemoveAlias}
            aliasPickActive={aliasPickActive}
            aliasPickPhrase={aliasPickPhrase}
            onAliasTargetPick={handleAliasTargetPick}
            onCancelAliasPick={cancelDictionaryAliasPick}
            grammarPanelOpen={grammarPanelOpen}
            onToggleGrammarPanel={handleToggleGrammarPanel}
            grammarEditCategoryId={grammarEditCategoryId}
            onGrammarEditCategoryChange={handleGrammarEditCategoryChange}
            focusTokenText={focusTokenText}
            onFocusTokenHandled={clearDictionaryTreeFocus}
            showDictionaryHeader={false}
            onMoveCategoryToLibrary={
              meta.scope === 'project' ? handleMoveCategoryToLibrary : undefined
            }
          />
        </div>
        {moveCategory && (
          <MoveCategoryToLibraryDialog
            categoryName={moveCategory.name}
            tokenCount={moveCategory.tokenCount}
            libraryDictionaries={libraryDictionaries}
            busy={moveBusy}
            error={moveError}
            onConfirm={(target) => void handleConfirmMoveCategory(target)}
            onClose={() => {
              if (!moveBusy) {
                setMoveCategory(null);
                setMoveError(null);
              }
            }}
          />
        )}
        {grammarPanelOpen && (
          <div className="w-52 flex-shrink-0 flex flex-col min-w-0 border-l border-[#1a3a2a]">
            <CategoryGrammarSidePanel
              ref={grammarEditorRef}
              category={grammarEditCategory}
              tokens={tokens}
              grammar={grammarForPanel}
              onSave={handleCategoryGrammarSave}
              onClose={() => {
                flushGrammarEditor();
                setGrammarEditCategoryId(null);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
});
