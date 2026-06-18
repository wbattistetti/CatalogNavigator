/**
 * Right-side test rail with draggable width (persisted in localStorage).
 */
import { useCallback, useRef, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'editor-test-rail-width';
const DEFAULT_WIDTH = 360;
const MIN_WIDTH = 280;
const MAX_WIDTH = 720;

function readStoredWidth(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_WIDTH;
    const n = Number(raw);
    if (!Number.isFinite(n)) return DEFAULT_WIDTH;
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, n));
  } catch {
    return DEFAULT_WIDTH;
  }
}

interface ResizableTestRailProps {
  children: ReactNode;
}

export function ResizableTestRail({ children }: ResizableTestRailProps) {
  const [width, setWidth] = useState(readStoredWidth);
  const [resizing, setResizing] = useState(false);

  const onSashPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setResizing(true);
    const startX = e.clientX;
    const startWidth = width;
    let latestWidth = startWidth;

    const onMove = (ev: PointerEvent) => {
      const delta = startX - ev.clientX;
      latestWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta));
      setWidth(latestWidth);
    };

    const onUp = () => {
      setResizing(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      try {
        localStorage.setItem(STORAGE_KEY, String(latestWidth));
      } catch {
        /* ignore */
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [width]);

  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      className={`flex flex-shrink-0 h-full min-h-0 ${resizing ? 'select-none' : ''}`}
      style={{ width }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Ridimensiona pannello test"
        onPointerDown={onSashPointerDown}
        className="w-1 flex-shrink-0 cursor-col-resize bg-[#1a3a2a] hover:bg-emerald-400/45 transition-colors"
      />
      <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
