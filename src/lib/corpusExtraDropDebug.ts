/**
 * Debug logging for corpus extra-column token drag/drop.
 * Enabled in dev by default; toggle with localStorage key `corpus-extra-drop-debug` (`1` / `0`).
 */

const DEBUG_KEY = 'corpus-extra-drop-debug';

let debugSequence = 0;

export function isCorpusExtraDropDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (localStorage.getItem(DEBUG_KEY) === '0') return false;
    if (localStorage.getItem(DEBUG_KEY) === '1') return true;
  } catch {
    /* ignore */
  }
  return import.meta.env.DEV;
}

/** Formats arrays/sets as readable comma lists for one-line console output. */
export function formatCorpusExtraDropValue(value: unknown): string {
  if (value == null) return String(value);
  if (Array.isArray(value)) return `[${value.join(', ')}]`;
  if (value instanceof Set) return `{${[...value].join(', ')}}`;
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/** Builds a single-line summary: `key=value, key2=value2`. */
export function summarizeCorpusExtraDropData(data: Record<string, unknown>): string {
  return Object.entries(data)
    .map(([key, value]) => `${key}=${formatCorpusExtraDropValue(value)}`)
    .join(' | ');
}

export function logCorpusExtraDrop(step: string, data?: Record<string, unknown>): void {
  if (!isCorpusExtraDropDebugEnabled()) return;
  debugSequence += 1;
  const tag = `[corpus-extra-drop #${debugSequence}] ${step}`;
  if (!data) {
    console.info(tag);
    return;
  }
  console.info(tag, data);
  console.info(`${tag} → ${summarizeCorpusExtraDropData(data)}`);
}

export function warnCorpusExtraDrop(step: string, data?: Record<string, unknown>): void {
  if (!isCorpusExtraDropDebugEnabled()) return;
  debugSequence += 1;
  const tag = `[corpus-extra-drop #${debugSequence}] ${step}`;
  if (!data) {
    console.warn(tag);
    return;
  }
  console.warn(tag, data);
  console.warn(`${tag} → ${summarizeCorpusExtraDropData(data)}`);
}

/** Resets sequence (tests only). */
export function resetCorpusExtraDropDebugSequence(): void {
  debugSequence = 0;
}

export function getCorpusExtraDropDebugSequence(): number {
  return debugSequence;
}
