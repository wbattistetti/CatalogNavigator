/**
 * Multi-select for ordered lists: Explorer-style clicks (plain / Ctrl / Shift)
 * plus brush drag on unselected rows (paint select) or Alt+drag (paint deselect).
 * Selected rows are left to HTML5 drag — no brush intercept.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const BRUSH_THRESHOLD_PX = 4;

interface BrushState {
  mode: 'select' | 'deselect';
  active: boolean;
  visited: Set<string>;
  originX: number;
  originY: number;
  originId: string;
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
  handleRowPointerEnter: (id: string) => void;
  isBrushActive: boolean;
  endInteraction: () => void;
}

/**
 * @param items Ordered ids for Shift+click range selection.
 * @param itemSelector CSS selector to resolve row id from pointer target (default `[data-select-id]`).
 */
export function useListSelection(
  items: string[],
  itemSelector = '[data-select-id]',
): UseListSelectionResult {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isBrushActive, setIsBrushActive] = useState(false);
  const anchorRef = useRef<number | null>(null);
  const brushRef = useRef<BrushState | null>(null);
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

  const applyBrush = useCallback((id: string) => {
    const brush = brushRef.current;
    if (!brush || brush.visited.has(id)) return;
    brush.visited.add(id);
    setSelected((prev) => {
      const next = new Set(prev);
      if (brush.mode === 'select') next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const endInteraction = useCallback(() => {
    brushRef.current = null;
    setIsBrushActive(false);
  }, []);

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

    // Selected row: leave to HTML5 drag; plain click keeps selection (Explorer).
    if (wasSelected && !e.altKey) {
      return;
    }

    // Brush: unselected → select; Alt+drag on selected → deselect.
    const mode: 'select' | 'deselect' = e.altKey && wasSelected ? 'deselect' : 'select';

    brushRef.current = {
      mode,
      active: false,
      visited: new Set<string>(),
      originX: e.clientX,
      originY: e.clientY,
      originId: id,
    };

    const onMove = (ev: PointerEvent) => {
      const brush = brushRef.current;
      if (!brush) return;

      const dx = ev.clientX - brush.originX;
      const dy = ev.clientY - brush.originY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (!brush.active && dist >= BRUSH_THRESHOLD_PX) {
        brush.active = true;
        setIsBrushActive(true);
        applyBrush(brush.originId);
      }

      if (brush.active) {
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const row = el?.closest(itemSelector) as HTMLElement | null;
        const rowId = row?.dataset.selectId;
        if (rowId) applyBrush(rowId);
      }
    };

    const onUp = () => {
      const brush = brushRef.current;
      if (brush && !brush.active && mode === 'select' && !wasSelected) {
        selectOnly(id);
      }
      endInteraction();
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [applyBrush, endInteraction, itemSelector, selectOnly, selectRange, toggleItem]);

  const handleRowPointerEnter = useCallback((id: string) => {
    const brush = brushRef.current;
    if (brush?.active) applyBrush(id);
  }, [applyBrush]);

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
    handleRowPointerEnter,
    isBrushActive,
    endInteraction,
  };
}
