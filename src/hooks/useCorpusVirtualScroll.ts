/**
 * Fixed-height virtual scroll window for large corpus tables.
 */
import {
  startTransition,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';

export interface CorpusVirtualRange {
  start: number;
  end: number;
  totalHeight: number;
  offsetY: number;
}

interface VirtualWindow {
  start: number;
  end: number;
  offsetY: number;
}

const DEFAULT_OVERSCAN = 8;

export function computeWindow(
  scrollTop: number,
  viewportHeight: number,
  itemCount: number,
  itemHeight: number,
  overscan: number,
): VirtualWindow {
  const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const visibleCount = Math.ceil(viewportHeight / itemHeight) + overscan * 2;
  const end = Math.min(itemCount, start + visibleCount);
  return { start, end, offsetY: start * itemHeight };
}

export function useCorpusVirtualScroll(
  itemCount: number,
  itemHeight: number,
  overscan = DEFAULT_OVERSCAN,
): {
  containerRef: RefObject<HTMLDivElement>;
  setContainerRef: (el: HTMLDivElement | null) => void;
  range: CorpusVirtualRange;
  totalHeight: number;
} {
  const containerRef = useRef<HTMLDivElement>(null);
  const [attachTick, setAttachTick] = useState(0);
  const [windowRange, setWindowRange] = useState<VirtualWindow>(() =>
    computeWindow(0, 0, itemCount, itemHeight, overscan),
  );
  const itemCountRef = useRef(itemCount);
  const rafRef = useRef<number | null>(null);

  const totalHeight = Math.max(0, itemCount * itemHeight);

  const setContainerRef = useCallback((el: HTMLDivElement | null) => {
    containerRef.current = el;
    if (el) setAttachTick((tick) => tick + 1);
  }, []);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const applyWindow = (next: VirtualWindow) => {
      startTransition(() => {
        setWindowRange((prev) => {
          if (
            prev.start === next.start
            && prev.end === next.end
            && prev.offsetY === next.offsetY
          ) {
            return prev;
          }
          return next;
        });
      });
    };

    const measure = () => {
      applyWindow(computeWindow(
        el.scrollTop,
        el.clientHeight,
        itemCount,
        itemHeight,
        overscan,
      ));
    };

    const onScroll = () => {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        measure();
      });
    };

    measure();
    el.addEventListener('scroll', onScroll, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      observer.disconnect();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [itemCount, itemHeight, overscan, attachTick]);

  useLayoutEffect(() => {
    if (itemCountRef.current === itemCount) return;
    itemCountRef.current = itemCount;
    const next = computeWindow(0, 0, itemCount, itemHeight, overscan);
    setWindowRange(next);
    containerRef.current?.scrollTo({ top: 0 });
  }, [itemCount, itemHeight, overscan]);

  return {
    containerRef,
    setContainerRef,
    totalHeight,
    range: {
      ...windowRange,
      totalHeight,
    },
  };
}
