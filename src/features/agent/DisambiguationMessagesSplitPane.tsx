/**
 * Horizontal split between disambiguation message list and detail editor.
 */
import { useCallback, useRef, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'disambiguation-messages-list-ratio';
const DEFAULT_RATIO = 38;
const MIN_RATIO = 22;
const MAX_RATIO = 72;

function readStoredRatio(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_RATIO;
    const n = Number(raw);
    if (!Number.isFinite(n)) return DEFAULT_RATIO;
    return Math.min(MAX_RATIO, Math.max(MIN_RATIO, n));
  } catch {
    return DEFAULT_RATIO;
  }
}

interface DisambiguationMessagesSplitPaneProps {
  list: ReactNode;
  detail: ReactNode;
}

export function DisambiguationMessagesSplitPane({
  list,
  detail,
}: DisambiguationMessagesSplitPaneProps) {
  const [ratio, setRatio] = useState(readStoredRatio);
  const [resizing, setResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const onSashPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setResizing(true);
    const startX = e.clientX;
    const startRatio = ratio;
    let latestRatio = startRatio;

    const onMove = (ev: PointerEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const width = container.getBoundingClientRect().width;
      if (width <= 0) return;
      const deltaRatio = ((ev.clientX - startX) / width) * 100;
      latestRatio = Math.min(MAX_RATIO, Math.max(MIN_RATIO, startRatio + deltaRatio));
      setRatio(latestRatio);
    };

    const onUp = () => {
      setResizing(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      try {
        localStorage.setItem(STORAGE_KEY, String(latestRatio));
      } catch {
        /* ignore */
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [ratio]);

  return (
    <div
      ref={containerRef}
      className={`flex flex-1 min-h-0 overflow-hidden ${resizing ? 'select-none' : ''}`}
    >
      <div
        className="flex flex-col min-h-0 min-w-0 border-r border-[#1a3a2a]"
        style={{ width: `${ratio}%` }}
      >
        {list}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Ridimensiona elenco messaggi"
        onPointerDown={onSashPointerDown}
        className="w-1 flex-shrink-0 cursor-col-resize bg-[#1a3a2a] hover:bg-emerald-400/45 transition-colors"
      />
      <div className="flex-1 min-w-0 min-h-0 bg-[#0a0f0c]">
        {detail}
      </div>
    </div>
  );
}
