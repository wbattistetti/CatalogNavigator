/**
 * Fixed-height virtual scroll window for large corpus tables.
 */
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

export interface CorpusVirtualRange {
  start: number;
  end: number;
  totalHeight: number;
  offsetY: number;
}

const DEFAULT_OVERSCAN = 6;

export function useCorpusVirtualScroll(
  itemCount: number,
  itemHeight: number,
  overscan = DEFAULT_OVERSCAN,
): {
  containerRef: RefObject<HTMLDivElement>;
  range: CorpusVirtualRange;
} {
  const containerRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<CorpusVirtualRange>({
    start: 0,
    end: Math.min(itemCount, 24),
    totalHeight: itemCount * itemHeight,
    offsetY: 0,
  });

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const height = el.clientHeight;
      const scrollTop = el.scrollTop;
      const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
      const visibleCount = Math.ceil(height / itemHeight) + overscan * 2;
      const end = Math.min(itemCount, start + visibleCount);
      setRange({
        start,
        end,
        totalHeight: itemCount * itemHeight,
        offsetY: start * itemHeight,
      });
    };

    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [itemCount, itemHeight, overscan]);

  return { containerRef, range };
}
