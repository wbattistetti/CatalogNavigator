/**
 * Explorer-style list selection: click, Ctrl+click toggle, Shift+click range.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface ListSelectionController {
  selected: Set<string>;
  selectedList: string[];
  setSelected: React.Dispatch<React.SetStateAction<Set<string>>>;
  clearSelection: () => void;
  selectAll: () => void;
  /** Left click on a list row (after filtering buttons/inputs). */
  handleRowClick: (e: React.MouseEvent, id: string) => void;
  isRowSelected: (id: string) => boolean;
}

export function rangeSelectIds(items: string[], anchor: number, targetIndex: number): Set<string> {
  const lo = Math.min(anchor, targetIndex);
  const hi = Math.max(anchor, targetIndex);
  const next = new Set<string>();
  for (let i = lo; i <= hi; i++) {
    const item = items[i];
    if (item) next.add(item);
  }
  return next;
}

export function toggleSelectedId(selected: Set<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export interface ListSelectionBinding {
  selected: Set<string>;
  setSelected: React.Dispatch<React.SetStateAction<Set<string>>>;
  /** Prune selection to these ids (e.g. all dictionary tokens). Omit to keep any selection. */
  validIds?: string[];
}

/** Ordered list multi-select: click, Ctrl+click, Shift+click. */
export function useListSelection(
  items: string[],
  binding?: ListSelectionBinding,
): ListSelectionController {
  const [internalSelected, setInternalSelected] = useState<Set<string>>(() => new Set());
  const selected = binding?.selected ?? internalSelected;
  const setSelected = binding?.setSelected ?? setInternalSelected;
  const anchorRef = useRef<number | null>(null);
  const itemsRef = useRef(items);
  const selectedRef = useRef(selected);
  itemsRef.current = items;
  selectedRef.current = selected;

  const itemsKey = items.join('\u001e');
  const validIdsKey = binding?.validIds?.join('\u001e') ?? '';
  const isBound = binding != null;

  useEffect(() => {
    const pruneTo = isBound
      ? (binding?.validIds ? new Set(binding.validIds) : null)
      : new Set(itemsRef.current);
    if (!pruneTo) return;
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => pruneTo.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [itemsKey, validIdsKey, isBound, setSelected, binding?.validIds]);

  const indexOf = useCallback((id: string) => itemsRef.current.indexOf(id), []);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    anchorRef.current = null;
  }, [setSelected]);

  const selectAll = useCallback(() => {
    setSelected(new Set(itemsRef.current));
    anchorRef.current = itemsRef.current.length > 0 ? 0 : null;
  }, [setSelected]);

  const handleRowClick = useCallback((e: React.MouseEvent, id: string) => {
    if ((e.target as HTMLElement).closest('button, input, a, label')) return;

    const idx = indexOf(id);
    if (idx < 0) return;

    if (e.shiftKey) {
      e.preventDefault();
      const anchor = anchorRef.current ?? idx;
      setSelected(rangeSelectIds(itemsRef.current, anchor, idx));
      anchorRef.current = idx;
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setSelected((prev) => toggleSelectedId(prev, id));
      anchorRef.current = idx;
      return;
    }

    // Plain click on one of several selected rows → keep multi-select (for drag).
    if (selectedRef.current.has(id) && selectedRef.current.size > 1) {
      anchorRef.current = idx;
      return;
    }

    setSelected(new Set([id]));
    anchorRef.current = idx;
  }, [indexOf, setSelected]);

  const isRowSelected = useCallback(
    (id: string) => selected.has(id),
    [selected],
  );

  return {
    selected,
    selectedList: [...selected],
    setSelected,
    clearSelection,
    selectAll,
    handleRowClick,
    isRowSelected,
  };
}
