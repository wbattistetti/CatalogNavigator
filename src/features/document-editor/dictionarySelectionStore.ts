/**
 * External store for dictionary token selection and drag state.
 * Isolated from DocumentEditorContext so chip clicks do not re-render the whole shell.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { toggleSelectedId } from '../../hooks/useListSelection';

export type DictionarySelectionSnapshot = {
  selected: ReadonlySet<string>;
  dragActive: boolean;
  dropTarget: string | null;
};

type SelectedUpdater = Set<string> | ((prev: Set<string>) => Set<string>);

let snapshot: DictionarySelectionSnapshot = {
  selected: new Set(),
  dragActive: false,
  dropTarget: null,
};

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function applySelected(updater: SelectedUpdater): void {
  const prev = snapshot.selected as Set<string>;
  const next = typeof updater === 'function' ? updater(prev) : updater;
  if (next.size === prev.size && [...next].every((id) => prev.has(id))) return;
  snapshot = { ...snapshot, selected: next };
  emit();
}

export function subscribeDictionarySelection(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDictionarySelectionSnapshot(): DictionarySelectionSnapshot {
  return snapshot;
}

export function resetDictionarySelection(): void {
  snapshot = { selected: new Set(), dragActive: false, dropTarget: null };
  emit();
}

export function setDictionaryTokenSelection(updater: SelectedUpdater): void {
  applySelected(updater);
}

export function setDictionaryTokenDragActive(active: boolean): void {
  if (snapshot.dragActive === active) return;
  snapshot = { ...snapshot, dragActive: active };
  emit();
}

export function setDictionaryCategoryDropTarget(target: string | null): void {
  if (snapshot.dropTarget === target) return;
  snapshot = { ...snapshot, dropTarget: target };
  emit();
}

export function clearDictionaryTokenSelection(): void {
  if (snapshot.selected.size === 0) return;
  snapshot = { ...snapshot, selected: new Set() };
  emit();
}

export function toggleDictionaryToken(canonical: string): void {
  applySelected((prev) => toggleSelectedId(prev, canonical));
}

export function selectSingleDictionaryToken(canonical: string): void {
  applySelected((prev) => {
    if (prev.has(canonical) && prev.size > 1) return prev;
    return new Set([canonical]);
  });
}

/** True only for this chip — re-renders when this chip's selection toggles. */
export function useDictionaryChipSelected(canonical: string): boolean {
  return useSyncExternalStore(
    subscribeDictionarySelection,
    () => getDictionarySelectionSnapshot().selected.has(canonical),
    () => getDictionarySelectionSnapshot().selected.has(canonical),
  );
}

/** True only when this chip is selected and a drag is active. */
export function useDictionaryChipDragging(canonical: string): boolean {
  return useSyncExternalStore(
    subscribeDictionarySelection,
    () => {
      const s = getDictionarySelectionSnapshot();
      return s.dragActive && s.selected.has(canonical);
    },
    () => {
      const s = getDictionarySelectionSnapshot();
      return s.dragActive && s.selected.has(canonical);
    },
  );
}

export function useDictionarySelectionCount(): number {
  return useSyncExternalStore(
    subscribeDictionarySelection,
    () => getDictionarySelectionSnapshot().selected.size,
    () => getDictionarySelectionSnapshot().selected.size,
  );
}

export function useDictionarySelectedSet(): ReadonlySet<string> {
  return useSyncExternalStore(
    subscribeDictionarySelection,
    () => getDictionarySelectionSnapshot().selected,
    () => getDictionarySelectionSnapshot().selected,
  );
}

export function useDictionaryDropTarget(): string | null {
  return useSyncExternalStore(
    subscribeDictionarySelection,
    () => getDictionarySelectionSnapshot().dropTarget,
    () => getDictionarySelectionSnapshot().dropTarget,
  );
}

export function useDictionaryDragActive(): boolean {
  return useSyncExternalStore(
    subscribeDictionarySelection,
    () => getDictionarySelectionSnapshot().dragActive,
    () => getDictionarySelectionSnapshot().dragActive,
  );
}

/** Stable setters for list components (TokenTreeEditor). */
export function useDictionarySelectionActions() {
  const setSelected = useCallback((updater: SelectedUpdater) => {
    setDictionaryTokenSelection(updater);
  }, []);
  const setDragActive = useCallback((active: boolean) => {
    setDictionaryTokenDragActive(active);
  }, []);
  const setDropTarget = useCallback((target: string | null) => {
    setDictionaryCategoryDropTarget(target);
  }, []);
  const clearSelection = useCallback(() => {
    clearDictionaryTokenSelection();
  }, []);
  return { setSelected, setDragActive, setDropTarget, clearSelection };
}
