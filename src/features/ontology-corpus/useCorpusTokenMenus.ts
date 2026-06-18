/**
 * Context menus and token-creation flows for corpus description selection.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { HighlightSpan, SelectionRange, TokenEntry } from '../../lib/tokenDictionary';
import {
  addToken,
  getSelectionOffsetsInElement,
  hasTextSelectionInElement,
  isCanonicalToken,
  removeAlias,
  removeCanonicalToken,
  selectionToTokenPhrase,
  suggestLongerTokenInSource,
  tokenizeToWords,
} from '../../lib/tokenDictionary';
import { type TokenCategory } from '../../lib/dictionaryTree';
import { useDocumentEditorDictionaryNav } from '../../features/document-editor/DocumentEditorContext';

const DOUBLE_CLICK_GAP_MS = 450;

export interface CorpusContextMenuState {
  x: number;
  y: number;
  phrase: string;
  range: SelectionRange | null;
  sourceText: string;
}

export interface LongerTokenPromptState {
  x: number;
  y: number;
  raw: string;
  range: SelectionRange | null;
  sourceText: string;
  shorterPhrase: string;
  longerToken: string;
}

export function useCorpusTokenMenus({
  tokens,
  categories,
  projectDictionaryId,
  onTokensChange,
  onCategoriesChange,
  dictionaryAliasPick,
}: {
  tokens: TokenEntry[];
  categories: TokenCategory[];
  projectDictionaryId: string | null;
  onTokensChange: (tokens: TokenEntry[]) => void;
  onCategoriesChange: (categories: TokenCategory[]) => void;
  dictionaryAliasPick: unknown;
}) {
  const {
    openDictionaryTree,
    startDictionaryAliasPick,
    cancelDictionaryAliasPick,
  } = useDocumentEditorDictionaryNav();

  const [menu, setMenu] = useState<CorpusContextMenuState | null>(null);
  const [longerTokenPrompt, setLongerTokenPrompt] = useState<LongerTokenPromptState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const longerPromptRef = useRef<HTMLDivElement>(null);
  const pendingMenuFrameRef = useRef<number | null>(null);
  const lastMouseUpAtRef = useRef(0);

  const cancelPendingMenuOpen = useCallback(() => {
    if (pendingMenuFrameRef.current !== null) {
      cancelAnimationFrame(pendingMenuFrameRef.current);
      pendingMenuFrameRef.current = null;
    }
  }, []);

  const aliasEntryByText = useRef(new Map<string, TokenEntry>());
  aliasEntryByText.current = new Map(
    tokens.filter((t) => t.aliasOf).map((t) => [t.text, t]),
  );

  const commitNewToken = useCallback((raw: string, range: SelectionRange | null) => {
    try {
      const phrase = selectionToTokenPhrase(raw, range);
      onTokensChange(addToken(tokens, raw, range));
      if (phrase && projectDictionaryId) {
        openDictionaryTree({ dictionaryId: projectDictionaryId, focusToken: phrase });
      }
    } catch {
      /* invalid */
    }
    window.getSelection()?.removeAllRanges();
  }, [onTokensChange, openDictionaryTree, projectDictionaryId, tokens]);

  const openLongerTokenPrompt = useCallback((
    clientX: number,
    clientY: number,
    sourceText: string,
    raw: string,
    range: SelectionRange | null,
    shorterPhrase: string,
    longerToken: string,
  ) => {
    setMenu(null);
    setLongerTokenPrompt({
      x: clientX,
      y: clientY,
      raw,
      range,
      sourceText,
      shorterPhrase,
      longerToken,
    });
  }, []);

  const attemptTokenCreate = useCallback((
    clientX: number,
    clientY: number,
    sourceText: string,
    raw: string,
    range: SelectionRange | null,
  ): boolean => {
    const phrase = selectionToTokenPhrase(raw, range);
    if (!phrase) return false;
    if (tokens.some((t) => t.text === phrase && isCanonicalToken(t))) return false;

    const longer = suggestLongerTokenInSource(phrase, sourceText, range, tokens);
    if (longer) {
      openLongerTokenPrompt(clientX, clientY, sourceText, raw, range, phrase, longer);
      return true;
    }

    commitNewToken(raw, range);
    return true;
  }, [commitNewToken, openLongerTokenPrompt, tokens]);

  const openContextMenuFromSelection = useCallback((
    clientX: number,
    clientY: number,
    sourceText: string,
    container: HTMLElement | null,
  ) => {
    const range = container ? getSelectionOffsetsInElement(container, sourceText) : null;
    const raw = window.getSelection()?.toString().trim() ?? '';
    const phrase = selectionToTokenPhrase(raw, range);
    if (!phrase) return;
    setLongerTokenPrompt(null);
    setMenu({ x: clientX, y: clientY, phrase: raw, range, sourceText });
  }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent, sourceText: string) => {
    e.stopPropagation();
    cancelPendingMenuOpen();
    setMenu(null);
    setLongerTokenPrompt(null);
    const container = e.currentTarget as HTMLElement;
    requestAnimationFrame(() => {
      const range = getSelectionOffsetsInElement(container, sourceText);
      const raw = window.getSelection()?.toString().trim() ?? '';
      const phrase = selectionToTokenPhrase(raw, range);
      if (!phrase || tokenizeToWords(phrase).length !== 1) return;
      attemptTokenCreate(e.clientX, e.clientY, sourceText, raw, range);
    });
  }, [attemptTokenCreate, cancelPendingMenuOpen]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (dictionaryAliasPick || e.button !== 0) return;
    if (Date.now() - lastMouseUpAtRef.current < DOUBLE_CLICK_GAP_MS) {
      cancelPendingMenuOpen();
      setMenu(null);
      setLongerTokenPrompt(null);
    }
  }, [cancelPendingMenuOpen, dictionaryAliasPick]);

  const handleMouseUp = useCallback((e: React.MouseEvent, sourceText: string) => {
    if (dictionaryAliasPick || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;

    const container = e.currentTarget as HTMLElement;
    const hasSelection = hasTextSelectionInElement(container);
    if ((e.target as HTMLElement).closest('[data-corpus-chip]') && !hasSelection) return;

    cancelPendingMenuOpen();
    if (e.detail >= 2) return;

    lastMouseUpAtRef.current = Date.now();
    openContextMenuFromSelection(e.clientX, e.clientY, sourceText, container);
  }, [cancelPendingMenuOpen, dictionaryAliasPick, openContextMenuFromSelection]);

  const handleContextMenu = useCallback((e: React.MouseEvent, sourceText: string) => {
    e.preventDefault();
    if (dictionaryAliasPick) return;
    const container = e.currentTarget as HTMLElement;
    openContextMenuFromSelection(e.clientX, e.clientY, sourceText, container);
  }, [dictionaryAliasPick, openContextMenuFromSelection]);

  const handleRemoveCanonical = useCallback((text: string) => {
    onTokensChange(removeCanonicalToken(tokens, text));
  }, [onTokensChange, tokens]);

  const handleRemoveAlias = useCallback((text: string) => {
    onTokensChange(removeAlias(tokens, text));
  }, [onTokensChange, tokens]);

  const handleRemoveSpan = useCallback((span: HighlightSpan) => {
    if (span.isAlias) {
      handleRemoveAlias(span.entryText);
    } else {
      handleRemoveCanonical(span.entryText);
    }
  }, [handleRemoveAlias, handleRemoveCanonical]);

  const createTokenFromMenu = useCallback(() => {
    if (!menu) return;
    const handled = attemptTokenCreate(menu.x, menu.y, menu.sourceText, menu.phrase, menu.range);
    if (handled) setMenu(null);
  }, [attemptTokenCreate, menu]);

  const startAliasPick = useCallback(() => {
    if (!menu) return;
    const normalizedPhrase = selectionToTokenPhrase(menu.phrase, menu.range);
    if (!normalizedPhrase) return;
    startDictionaryAliasPick({
      phrase: menu.phrase,
      range: menu.range,
      normalizedPhrase,
    });
    setMenu(null);
  }, [menu, startDictionaryAliasPick]);

  const menuPhrase = menu ? selectionToTokenPhrase(menu.phrase, menu.range) : null;
  const menuIsCanonical = menuPhrase
    ? tokens.some((t) => t.text === menuPhrase && isCanonicalToken(t))
    : false;
  const menuAliasEntry = menuPhrase ? aliasEntryByText.current.get(menuPhrase) : undefined;
  const menuWordCount = menuPhrase ? tokenizeToWords(menuPhrase).length : 0;
  const canCreateToken = Boolean(menuPhrase && !menuIsCanonical && menuWordCount >= 1);
  const canStartAliasPick = Boolean(menuPhrase && !menuIsCanonical);

  useEffect(() => () => cancelPendingMenuOpen(), [cancelPendingMenuOpen]);

  useEffect(() => {
    if (!longerTokenPrompt) return;
    const closePrompt = (e: PointerEvent) => {
      if (longerPromptRef.current?.contains(e.target as Node)) return;
      setLongerTokenPrompt(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLongerTokenPrompt(null);
    };
    document.addEventListener('pointerdown', closePrompt);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', closePrompt);
      document.removeEventListener('keydown', onKey);
    };
  }, [longerTokenPrompt]);

  useLayoutEffect(() => {
    const el = longerPromptRef.current;
    if (!el || !longerTokenPrompt) return;
    const pad = 8;
    const rect = el.getBoundingClientRect();
    let left = longerTokenPrompt.x;
    let top = longerTokenPrompt.y;
    if (left + rect.width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (top + rect.height > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - rect.height - pad);
    }
    if (left < pad) left = pad;
    if (top < pad) top = pad;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [longerTokenPrompt]);

  useEffect(() => {
    if (!menu) return;
    const closeMenu = (e: PointerEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenu(null);
    };
    document.addEventListener('pointerdown', closeMenu);
    return () => document.removeEventListener('pointerdown', closeMenu);
  }, [menu]);

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el || !menu) return;
    const pad = 8;
    const rect = el.getBoundingClientRect();
    let left = menu.x;
    let top = menu.y;
    if (left + rect.width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (top + rect.height > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - rect.height - pad);
    }
    if (left < pad) left = pad;
    if (top < pad) top = pad;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [menu]);

  useEffect(() => {
    if (!dictionaryAliasPick) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelDictionaryAliasPick();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [cancelDictionaryAliasPick, dictionaryAliasPick]);

  return {
    menu,
    menuRef,
    longerTokenPrompt,
    longerPromptRef,
    menuPhrase,
    menuIsCanonical,
    menuAliasEntry,
    canCreateToken,
    canStartAliasPick,
    createTokenFromMenu,
    startAliasPick,
    commitNewToken,
    handleRemoveCanonical,
    handleRemoveAlias,
    handleRemoveSpan,
    handleDoubleClick,
    handleMouseDown,
    handleMouseUp,
    handleContextMenu,
    setMenu,
    setLongerTokenPrompt,
  };
}
