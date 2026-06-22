/**
 * Shared normalization helpers for pharma dictionary refactor.
 */
export function normalizeKey(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

/** Collapses whitespace; preserves original casing when possible. */
export function normalizePhrase(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

export function dedupeTokens(tokens: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens) {
    const key = normalizeKey(t);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(normalizePhrase(t));
  }
  return out.sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));
}

/** Parses Italian decimal numbers (1,5 / 1.5). */
export function parseItalianNumber(raw: string): number | null {
  const n = raw.trim().replace(',', '.');
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

export function formatKgRange(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `${min}–${max} kg`;
  if (min != null) return `≥ ${min} kg`;
  if (max != null) return `≤ ${max} kg`;
  return null;
}

export function formatQuantity(value: number, unit: string): string {
  const u = unit.toLowerCase();
  const num = Number.isInteger(value) ? String(value) : String(value).replace('.', ',');
  if (u === 'cpr' || u === 'cp') return `${num} compresse`;
  if (u === 'dose' || u === 'dosi') return `${num} ${value === 1 ? 'dose' : 'dosi'}`;
  return `${num} ${u}`;
}
