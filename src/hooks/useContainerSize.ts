/**
 * Tracks the content box size of a container via ResizeObserver.
 * Ignores small width jitter from scrollbar appearance to avoid grid remounts.
 */
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { tabularGlideLogResize } from '../components/DocumentViewer/tabularGlideDebug';

export interface ContainerSize {
  width: number;
  height: number;
}

const SCROLLBAR_WIDTH_JITTER_PX = 20;

function shouldIgnoreResize(prev: ContainerSize, next: ContainerSize): boolean {
  if (prev.width === 0 && prev.height === 0) return false;
  const widthDelta = Math.abs(prev.width - next.width);
  const heightDelta = Math.abs(prev.height - next.height);
  // Ignore scrollbar gutter jitter (vertical bar −width, horizontal bar −height).
  return widthDelta <= SCROLLBAR_WIDTH_JITTER_PX && heightDelta <= SCROLLBAR_WIDTH_JITTER_PX;
}

export function useContainerSize(): {
  containerRef: RefObject<HTMLDivElement>;
  size: ContainerSize;
} {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<ContainerSize>({ width: 0, height: 0 });
  const rafRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const next = {
        width: Math.floor(el.clientWidth),
        height: Math.floor(el.clientHeight),
      };
      setSize((prev) => {
        if (prev.width === next.width && prev.height === next.height) return prev;
        if (shouldIgnoreResize(prev, next)) return prev;
        tabularGlideLogResize(prev, next);
        return next;
      });
    };

    const scheduleMeasure = () => {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        measure();
      });
    };

    measure();
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  return { containerRef, size };
}
