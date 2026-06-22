/**
 * Formatting helpers for disambiguation compute / IA generation progress UI.
 */

/** Formats milliseconds as m:ss or h:mm:ss. */
export function formatElapsedMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  if (m > 0) {
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  return `${s} s`;
}

/** Formats a rate per minute for display. */
export function formatRatePerMinute(rate: number, unit: string): string {
  if (!Number.isFinite(rate) || rate <= 0) return `— ${unit}/min`;
  return `~${rate.toLocaleString('it-IT', { maximumFractionDigits: 1 })} ${unit}/min`;
}

/** Estimates remaining minutes from processed/total and elapsed ms. */
export function estimateRemainingMinutes(
  processed: number,
  total: number,
  elapsedMs: number,
): number | null {
  if (total <= 0 || processed <= 0 || processed >= total || elapsedMs <= 0) return null;
  const remaining = total - processed;
  const msPerUnit = elapsedMs / processed;
  return (remaining * msPerUnit) / 60_000;
}

/** Activity-based progress for BFS — avoids jumping to 98% when the queue empties. */
export function bfsPseudoProgressPercent(visitedStates: number, queueLength: number): number {
  const work = visitedStates + queueLength;
  if (work <= 0) return 4;
  return Math.min(88, 4 + Math.log10(work + 1) * 22);
}
