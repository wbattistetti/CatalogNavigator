/**
 * Multi-select for ordered lists: Explorer-style clicks (plain / Ctrl / Shift)
 * plus brush drag on unselected rows (paint select) or Alt+drag (paint deselect).
 * Selected rows are left to HTML5 drag — no brush intercept.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

const BRUSH_THRESHOLD_PX = 4;

interface BrushState {
  mode: 'select' | 'deselect';
  active: boolean;
  visited: Set<string>;
  originX: number;
  originY: number;
  originId: string;
  /** Last list index touched — range-fill selects every row between moves. */
  lastIndex: number | null;
  /** First flush after plain brush replaces the previous selection. */
  replaceOnNextFlush: boolean;
}

/** Resolve the token row under the pointer, scoped to one list container. */
function rowIdAtClientY(
  root: HTMLElement,
  clientX: number,
  clientY: number,
  itemSelector: string,
  validIds: ReadonlySet<string>,
): string | undefined {
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    if (!root.contains(el)) continue;
    const id = (el.closest(itemSelector) as HTMLElement | null)?.dataset.selectId;
    if (id && validIds.has(id)) return id;
  }

  const rows = root.querySelectorAll<HTMLElement>(itemSelector);
  for (const row of rows) {
    const id = row.dataset.selectId;
    if (!id || !validIds.has(id)) continue;
    const rect = row.getBoundingClientRect();
    if (
      clientY >= rect.top
      && clientY <= rect.bottom
      && clientX >= rect.left
      && clientX <= rect.right
    ) {
      return id;
    }
  }

  const rootRect = root.getBoundingClientRect();
  if (
    clientX < rootRect.left
    || clientX > rootRect.right
    || clientY < rootRect.top
    || clientY > rootRect.bottom
  ) {
    return undefined;
  }

  let bestId: string | undefined;
  let bestDist = Infinity;
  for (const row of rows) {
    const id = row.dataset.selectId;
    if (!id || !validIds.has(id)) continue;
    const rect = row.getBoundingClientRect();
    const mid = (rect.top + rect.bottom) / 2;
    const dist = Math.abs(clientY - mid);
    if (dist < bestDist) {
      bestDist = dist;
      bestId = id;
    }
  }
  return bestId;
}

export interface UseListSelectionResult {
  selected: Set<string>;
  selectedList: string[];
  setSelected: React.Dispatch<React.SetStateAction<Set<string>>>;
  clearSelection: () => void;
  selectAll: () => void;
  selectOnly: (id: string) => void;
  toggleItem: (id: string) => void;
  handleRowPointerDown: (e: React.PointerEvent, id: string) => void;
  handleListPointerOver: (e: React.PointerEvent) => void;
  isBrushActive: boolean;
  endInteraction: () => void;
}

/**
 * @param items Ordered ids for Shift+click range selection.
 * @param itemSelector CSS selector to resolve row id from pointer target (default `[data-select-id]`).
 * @param listRootRef Scroll container for the list — brush hit-testing stays inside it.
 */
export function useListSelection(
  items: string[],
  itemSelector = '[data-select-id]',
  listRootRef?: RefObject<HTMLElement | null>,
): UseListSelectionResult {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isBrushActive, setIsBrushActive] = useState(false);
  const anchorRef = useRef<number | null>(null);
  const brushRef = useRef<BrushState | null>(null);
  const pendingBrushIdsRef = useRef<Set<string>>(new Set());
  const flushBrushRafRef = useRef<number | null>(null);
  const pointerMoveRafRef = useRef<number | null>(null);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const selectedRef = useRef(selected);
  const itemsRef = useRef(items);
  selectedRef.current = selected;
  itemsRef.current = items;

  useEffect(() => {
    setSelected((prev) => {
      const valid = new Set(items);
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  const indexOf = useCallback((id: string) => itemsRef.current.indexOf(id), []);

  const selectOnly = useCallback((id: string) => {
    setSelected(new Set([id]));
    anchorRef.current = indexOf(id);
  }, [indexOf]);

  const toggleItem = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    anchorRef.current = indexOf(id);
  }, [indexOf]);

  const selectRange = useCallback((id: string) => {
    const idx = indexOf(id);
    const anchor = anchorRef.current ?? idx;
    if (idx < 0) return;
    const lo = Math.min(anchor, idx);
    const hi = Math.max(anchor, idx);
    const list = itemsRef.current;
    const next = new Set<string>();
    for (let i = lo; i <= hi; i++) {
      const item = list[i];
      if (item) next.add(item);
    }
    setSelected(next);
  }, [indexOf]);

  const selectAll = useCallback(() => {
    setSelected(new Set(itemsRef.current));
    if (itemsRef.current.length > 0) {
      anchorRef.current = 0;
    }
  }, []);

  const flushBrushSelection = useCallback(() => {
    flushBrushRafRef.current = null;
    const brush = brushRef.current;
    const pending = pendingBrushIdsRef.current;
    if (!brush || pending.size === 0) return;

    const ids = [...pending];
    pending.clear();
    const mode = brush.mode;
    const replace = brush.replaceOnNextFlush;
    brush.replaceOnNextFlush = false;

    setSelected((prev) => {
      const next = replace ? new Set<string>() : new Set(prev);
      for (const id of ids) {
        if (mode === 'select') next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const scheduleBrushFlush = useCallback(() => {
    if (flushBrushRafRef.current !== null) return;
    flushBrushRafRef.current = requestAnimationFrame(flushBrushSelection);
  }, [flushBrushSelection]);

  const applyBrushSpan = useCallback((id: string) => {
    const brush = brushRef.current;
    if (!brush) return;

    const list = itemsRef.current;
    const idx = list.indexOf(id);
    if (idx < 0) return;

    const lastIdx = brush.lastIndex ?? idx;
    const lo = Math.min(lastIdx, idx);
    const hi = Math.max(lastIdx, idx);
    let changed = false;

    for (let i = lo; i <= hi; i++) {
      const itemId = list[i];
      if (!itemId || brush.visited.has(itemId)) continue;
      brush.visited.add(itemId);
      pendingBrushIdsRef.current.add(itemId);
      changed = true;
    }
    brush.lastIndex = idx;
    if (changed) scheduleBrushFlush();
  }, [scheduleBrushFlush]);

  const cancelBrushRaf = useCallback(() => {
    if (flushBrushRafRef.current !== null) {
      cancelAnimationFrame(flushBrushRafRef.current);
      flushBrushRafRef.current = null;
    }
    if (pointerMoveRafRef.current !== null) {
      cancelAnimationFrame(pointerMoveRafRef.current);
      pointerMoveRafRef.current = null;
    }
    pendingBrushIdsRef.current.clear();
  }, []);

  const endInteraction = useCallback(() => {
    flushBrushSelection();
    cancelBrushRaf();
    brushRef.current = null;
    setIsBrushActive(false);
  }, [cancelBrushRaf, flushBrushSelection]);

  const resolveRowIdAt = useCallback((clientX: number, clientY: number): string | undefined => {
    const root = listRootRef?.current;
    if (!root) return undefined;
    return rowIdAtClientY(
      root,
      clientX,
      clientY,
      itemSelector,
      new Set(itemsRef.current),
    );
  }, [itemSelector, listRootRef]);

  const samplePointerTarget = useCallback((clientX: number, clientY: number) => {
    const rowId = resolveRowIdAt(clientX, clientY);
    if (rowId) applyBrushSpan(rowId);
  }, [applyBrushSpan, resolveRowIdAt]);

  const handleRowPointerDown = useCallback((e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, input, a')) return;

    if (e.shiftKey) {
      e.preventDefault();
      selectRange(id);
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      toggleItem(id);
      return;
    }

    const wasSelected = selectedRef.current.has(id);

    if (wasSelected && !e.altKey) {
      return;
    }

    const mode: 'select' | 'deselect' = e.altKey && wasSelected ? 'deselect' : 'select';

    brushRef.current = {
      mode,
      active: false,
      visited: new Set<string>(),
      originX: e.clientX,
      originY: e.clientY,
      originId: id,
      lastIndex: itemsRef.current.indexOf(id),
      replaceOnNextFlush: false,
    };
    lastPointerRef.current = { x: e.clientX, y: e.clientY };

    const captureTarget = listRootRef?.current ?? (e.currentTarget as HTMLElement | null) ?? e.target;
    if (captureTarget instanceof HTMLElement && 'setPointerCapture' in captureTarget) {
      try {
        captureTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore — capture is best-effort */
      }
    }

    const onMove = (ev: PointerEvent) => {
      const brush = brushRef.current;
      if (!brush) return;

      lastPointerRef.current = { x: ev.clientX, y: ev.clientY };

      const dx = ev.clientX - brush.originX;
      const dy = ev.clientY - brush.originY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (!brush.active && dist >= BRUSH_THRESHOLD_PX) {
        brush.active = true;
        setIsBrushActive(true);
        if (mode === 'select') {
          brush.replaceOnNextFlush = true;
          brush.visited.clear();
        }
        applyBrushSpan(brush.originId);
      }

      if (!brush.active || pointerMoveRafRef.current !== null) return;
      pointerMoveRafRef.current = requestAnimationFrame(() => {
        pointerMoveRafRef.current = null;
        const b = brushRef.current;
        if (!b?.active) return;
        samplePointerTarget(lastPointerRef.current.x, lastPointerRef.current.y);
      });
    };

    const onUp = (ev: PointerEvent) => {
      const brush = brushRef.current;
      if (brush && !brush.active && mode === 'select' && !wasSelected) {
        selectOnly(id);
      }
      endInteraction();
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      if (captureTarget instanceof HTMLElement && 'releasePointerCapture' in captureTarget) {
        try {
          if (captureTarget.hasPointerCapture(ev.pointerId)) {
            captureTarget.releasePointerCapture(ev.pointerId);
          }
        } catch {
          /* ignore */
        }
      }
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [
    applyBrushSpan,
    endInteraction,
    listRootRef,
    samplePointerTarget,
    selectOnly,
    selectRange,
    toggleItem,
  ]);

  const handleListPointerOver = useCallback((e: React.PointerEvent) => {
    if (!brushRef.current?.active) return;
    const rowId = resolveRowIdAt(e.clientX, e.clientY);
    if (rowId) applyBrushSpan(rowId);
  }, [applyBrushSpan, resolveRowIdAt]);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const selectedList = [...selected];

  return {
    selected,
    selectedList,
    setSelected,
    clearSelection,
    selectAll,
    selectOnly,
    toggleItem,
    handleRowPointerDown,
    handleListPointerOver,
    isBrushActive,
    endInteraction,
  };
}
