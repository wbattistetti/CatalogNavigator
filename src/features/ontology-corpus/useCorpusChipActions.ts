/**
 * Chip selection and drag-to-category handlers for the corpus editor.
 */
import { useCallback, useMemo, useRef, type RefObject } from 'react';
import type { TokenCategory } from '../../lib/dictionaryTree';
import { hasTextSelectionInElement } from '../../lib/tokenDictionary';
import {
  getDictionarySelectionSnapshot,
  selectSingleDictionaryToken,
  setDictionaryCategoryDropTarget,
  setDictionaryTokenDragActive,
  toggleDictionaryToken,
} from '../../features/document-editor/dictionarySelectionStore';
import type { CorpusChipActions } from '../../components/DocumentViewer/CorpusChipActionsContext';
import {
  DRAG_THRESHOLD_PX,
  assignTokensToCategory,
  categoryIdAtPoint,
  formatDragGhostLabel,
} from '../../lib/dictionaryTokenDrag';

export function useCorpusChipActions(
  editableCanonicalSet: ReadonlySet<string>,
  categories: TokenCategory[],
  onCategoriesChange: (categories: TokenCategory[]) => void,
): {
  chipActions: CorpusChipActions;
  dragGhostRef: RefObject<HTMLDivElement | null>;
} {
  const dragGhostRef = useRef<HTMLDivElement>(null);

  const hideDragGhost = useCallback(() => {
    const ghost = dragGhostRef.current;
    if (!ghost) return;
    ghost.style.left = '-9999px';
    ghost.style.top = '0';
    ghost.style.visibility = 'hidden';
  }, []);

  const showDragGhost = useCallback((label: string, clientX: number, clientY: number) => {
    const ghost = dragGhostRef.current;
    if (!ghost) return;
    ghost.textContent = label;
    ghost.style.left = `${clientX + 12}px`;
    ghost.style.top = `${clientY + 16}px`;
    ghost.style.visibility = 'visible';
  }, []);

  const moveChipsToCategory = useCallback((targetKey: string, tokenTexts: string[]) => {
    const valid = tokenTexts.filter((t) => editableCanonicalSet.has(t));
    if (valid.length === 0) return;
    try {
      onCategoriesChange(assignTokensToCategory(categories, targetKey, valid));
    } catch {
      /* invalid */
    }
  }, [categories, editableCanonicalSet, onCategoriesChange]);

  const handleChipClick = useCallback((e: React.MouseEvent, canonical: string) => {
    if (!editableCanonicalSet.has(canonical)) return;
    if ((e.target as HTMLElement).closest('button')) return;
    const row = (e.currentTarget as HTMLElement).closest('[data-corpus-description-row]');
    if (row instanceof HTMLElement && hasTextSelectionInElement(row)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      toggleDictionaryToken(canonical);
      return;
    }
    selectSingleDictionaryToken(canonical);
  }, [editableCanonicalSet]);

  const startChipPointerDrag = useCallback((e: React.MouseEvent, canonical: string) => {
    if (!editableCanonicalSet.has(canonical)) return;
    if ((e.target as HTMLElement).closest('button')) return;
    if (e.shiftKey || e.ctrlKey || e.metaKey) return;

    const row = (e.currentTarget as HTMLElement).closest('[data-corpus-description-row]');
    const originX = e.clientX;
    const originY = e.clientY;
    let active = false;
    let texts: string[] = [];

    const onMove = (ev: MouseEvent) => {
      if (row instanceof HTMLElement && hasTextSelectionInElement(row)) return;
      if (!active) {
        if (Math.hypot(ev.clientX - originX, ev.clientY - originY) < DRAG_THRESHOLD_PX) return;
        window.getSelection()?.removeAllRanges();
        const snapshot = getDictionarySelectionSnapshot();
        if (!snapshot.selected.has(canonical)) {
          selectSingleDictionaryToken(canonical);
        }
        texts = [...getDictionarySelectionSnapshot().selected]
          .filter((t) => editableCanonicalSet.has(t));
        if (texts.length === 0) return;
        active = true;
        setDictionaryTokenDragActive(true);
        showDragGhost(formatDragGhostLabel(texts), ev.clientX, ev.clientY);
      } else {
        showDragGhost(formatDragGhostLabel(texts), ev.clientX, ev.clientY);
        setDictionaryCategoryDropTarget(categoryIdAtPoint(ev.clientX, ev.clientY));
      }
    };

    const onUp = (ev: MouseEvent) => {
      if (active) {
        const catId = categoryIdAtPoint(ev.clientX, ev.clientY);
        if (catId) moveChipsToCategory(catId, texts);
      }
      setDictionaryTokenDragActive(false);
      setDictionaryCategoryDropTarget(null);
      hideDragGhost();
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [
    editableCanonicalSet,
    hideDragGhost,
    moveChipsToCategory,
    showDragGhost,
  ]);

  const chipActions = useMemo((): CorpusChipActions => ({
    editableCanonicalSet,
    onChipClick: handleChipClick,
    onChipMouseDown: startChipPointerDrag,
  }), [editableCanonicalSet, handleChipClick, startChipPointerDrag]);

  return { chipActions, dragGhostRef };
}
