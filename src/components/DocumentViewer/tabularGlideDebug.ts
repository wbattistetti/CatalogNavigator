/**
 * Dev-only diagnostics for Tabular Glide grid scroll/render issues.
 */

const ENABLED = import.meta.env.DEV;

export interface GlideScrollSample {
  t: number;
  rows: number;
  cols: number;
  y: number;
  height: number;
  cellCalls: number;
  cellMs: number;
  previewRender: number;
  gridRender: number;
}

let previewRenderCount = 0;
let gridRenderCount = 0;
let cellCallCount = 0;
let cellCallMs = 0;
let lastScrollLog = 0;

export function tabularGlideLogPreviewRender(): void {
  if (!ENABLED) return;
  previewRenderCount += 1;
}

export function tabularGlideLogGridRender(): void {
  if (!ENABLED) return;
  gridRenderCount += 1;
}

/** Record one getCellContent invocation duration (ms). */
export function tabularGlideRecordCellCall(durationMs: number): void {
  if (!ENABLED) return;
  cellCallCount += 1;
  cellCallMs += durationMs;
}

/** Throttled scroll-region log — call from onVisibleRegionChanged only. */
export function tabularGlideLogScrollRegion(sample: Omit<GlideScrollSample, 't' | 'cellCalls' | 'cellMs' | 'previewRender' | 'gridRender'>): void {
  if (!ENABLED) return;
  const now = performance.now();
  if (now - lastScrollLog < 400) return;
  lastScrollLog = now;

  const payload: GlideScrollSample = {
    t: Math.round(now),
    ...sample,
    cellCalls: cellCallCount,
    cellMs: Math.round(cellCallMs * 100) / 100,
    previewRender: previewRenderCount,
    gridRender: gridRenderCount,
  };

  cellCallCount = 0;
  cellCallMs = 0;

  console.info('[TabularGlide scroll]', payload);
}

export function tabularGlideLogMount(label: string, data: Record<string, unknown>): void {
  if (!ENABLED) return;
  console.info(`[TabularGlide ${label}]`, data);
}

export function tabularGlideLogResize(prev: { width: number; height: number }, next: { width: number; height: number }): void {
  if (!ENABLED) return;
  console.info('[TabularGlide resize]', { from: prev, to: next, previewRender: previewRenderCount, gridRender: gridRenderCount });
}

/** Warn when the main thread is blocked for >50ms (scroll jank / freeze). */
export function tabularGlideInstallLongTaskWatcher(): () => void {
  if (!ENABLED || typeof PerformanceObserver === 'undefined') return () => {};

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        console.warn('[TabularGlide longtask]', {
          ms: Math.round(entry.duration),
          at: Math.round(entry.startTime),
          previewRender: previewRenderCount,
          gridRender: gridRenderCount,
        });
      }
    });
    observer.observe({ entryTypes: ['longtask'] });
    return () => observer.disconnect();
  } catch {
    return () => {};
  }
}
