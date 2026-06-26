/**
 * Readable catalog entries: per document-line spoken confirmation text + review status.
 */
import type { RowStatus } from './analysisTypes';
import { DEFAULT_CONFIRMATION_PREAMBLE } from './confirmationPrompts';

export interface ReadableCatalogEntry {
  text: string;
  status: RowStatus;
}

export type ReadableCatalogStorage = Record<string, ReadableCatalogEntry>;

export interface ReadableCatalogRow {
  path: string;
  sourceText: string;
  text: string;
  status: RowStatus;
}

export interface ReadableCatalogSegmentationRow {
  path: string;
  sourceText: string;
}

/** Stable storage key for one corpus document line (NOME_VISITA). */
export function readableCatalogKey(sourceText: string): string {
  return sourceText.trim().replace(/\s+/g, ' ');
}

/** Parses persisted readable_catalog JSON from analysis load. */
export function parseReadableCatalog(raw: unknown): ReadableCatalogStorage | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: ReadableCatalogStorage = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key.trim() || !value || typeof value !== 'object' || Array.isArray(value)) continue;
    const entry = value as Record<string, unknown>;
    const text = typeof entry.text === 'string' ? entry.text.trim() : '';
    if (!text) continue;
    const status = normalizeReadableStatus(entry.status);
    out[key] = { text, status };
  }
  return Object.keys(out).length > 0 ? out : null;
}

function normalizeReadableStatus(value: unknown): RowStatus {
  if (value === 'approved' || value === 'rejected' || value === 'uncertain') return value;
  return null;
}

function lookupCatalogEntry(
  catalog: ReadableCatalogStorage | null | undefined,
  sourceText: string,
  path: string,
): ReadableCatalogEntry | undefined {
  if (!catalog) return undefined;
  const sourceKey = readableCatalogKey(sourceText);
  if (sourceKey && catalog[sourceKey]) return catalog[sourceKey];
  if (catalog[path]) return catalog[path];
  return undefined;
}

/** Drops entries for document lines / paths no longer in the corpus. */
export function pruneReadableCatalog(
  catalog: ReadableCatalogStorage | null | undefined,
  validSourceTexts: readonly string[],
  validPaths: readonly string[] = [],
): ReadableCatalogStorage | null {
  if (!catalog) return null;
  const validSources = new Set(validSourceTexts.map(readableCatalogKey).filter(Boolean));
  const validPathSet = new Set(validPaths.map((p) => p.trim()).filter(Boolean));
  const next: ReadableCatalogStorage = {};
  for (const [key, entry] of Object.entries(catalog)) {
    if (validSources.has(key) || validPathSet.has(key)) next[key] = entry;
  }
  return Object.keys(next).length > 0 ? next : null;
}

interface ConfirmationCandidate {
  text: string;
  status: RowStatus;
  hasStoredReadable: boolean;
  order: number;
}

/** Picks one spoken description when several corpus lines share the same catalog path. */
function pickSingleReadableConfirmation(
  path: string,
  sourceLines: readonly string[],
  catalog: ReadableCatalogStorage | null | undefined,
): string {
  const pathTrimmed = path.trim();
  const pathEntry = pathTrimmed ? catalog?.[pathTrimmed] : undefined;
  if (pathEntry?.text?.trim()) {
    return stripTrailingCatalogPath(pathEntry.text, path);
  }

  const candidates: ConfirmationCandidate[] = sourceLines
    .map((line, order) => {
      const sourceText = line.trim() || pathTrimmed;
      const stored = lookupCatalogEntry(catalog, sourceText, path);
      const text = stored?.text?.trim()
        ? stripTrailingCatalogPath(stored.text, path)
        : stripTrailingCatalogPath(sourceText, path);
      return {
        text,
        status: stored?.status ?? null,
        hasStoredReadable: !!stored?.text?.trim(),
        order,
      };
    })
    .filter((candidate) => candidate.text.length > 0);

  if (candidates.length === 0) return pathTrimmed || path;

  const approved = candidates.find((candidate) => candidate.status === 'approved');
  if (approved) return approved.text;

  const readable = candidates.find(
    (candidate) => candidate.hasStoredReadable && candidate.status !== 'rejected',
  );
  if (readable) return readable.text;

  return candidates[0]!.text;
}

/**
 * Resolves one spoken confirmation phrase for a catalog path (readable → first corpus line).
 * Never joins multiple document lines — runtime confirms a single surviving candidate.
 */
export function resolveReadableConfirmationForPath(
  path: string,
  corpusRows: readonly ReadableCatalogSegmentationRow[],
  catalog: ReadableCatalogStorage | null | undefined,
): string {
  const lines = corpusRows
    .filter((row) => row.path === path)
    .map((row) => row.sourceText.trim())
    .filter(Boolean);
  if (lines.length === 0) return path.trim() || path;
  return pickSingleReadableConfirmation(path, lines, catalog);
}

/** Resolves spoken confirmation from one source line or legacy joined sourceText. */
export function resolveReadableConfirmationText(
  path: string,
  sourceText: string,
  catalog: ReadableCatalogStorage | null | undefined,
): string {
  const lines = sourceText.split(';').map((part) => part.trim()).filter(Boolean);
  if (lines.length === 0) return path.trim() || path;
  return pickSingleReadableConfirmation(path, lines, catalog);
}

/** Removes a trailing ontology path accidentally present in the description text. */
export function stripTrailingCatalogPath(text: string, path: string): string {
  const trimmed = text.trim();
  const pathTrimmed = path.trim();
  if (!trimmed || !pathTrimmed) return trimmed;
  if (trimmed === pathTrimmed) return trimmed;
  const suffix = ` ${pathTrimmed}`;
  if (trimmed.endsWith(suffix)) {
    const without = trimmed.slice(0, -suffix.length).trimEnd();
    if (without.length > 0) return without;
  }
  return trimmed;
}

/** One editor row per corpus document line (not deduplicated by catalog path). */
export function buildReadableCatalogRowsFromSegmentation(
  rows: readonly ReadableCatalogSegmentationRow[],
  catalog: ReadableCatalogStorage | null | undefined,
): ReadableCatalogRow[] {
  return rows.map((row) => {
    const sourceText = row.sourceText.trim() || row.path;
    const stored = lookupCatalogEntry(catalog, sourceText, row.path);
    return {
      path: row.path,
      sourceText,
      text: stored?.text?.trim() || sourceText,
      status: stored?.status ?? null,
    };
  });
}

/** @deprecated Use buildReadableCatalogRowsFromSegmentation — one row per unique path. */
export function buildReadableCatalogRows(
  itemPaths: readonly string[],
  sourceTextByPath: ReadonlyMap<string, string> | Record<string, string>,
  catalog: ReadableCatalogStorage | null | undefined,
): ReadableCatalogRow[] {
  const getSource = (path: string): string => {
    if (sourceTextByPath instanceof Map) {
      return sourceTextByPath.get(path) ?? path;
    }
    return sourceTextByPath[path] ?? path;
  };

  return itemPaths.map((path) => {
    const sourceText = getSource(path);
    const stored = lookupCatalogEntry(catalog, sourceText, path);
    return {
      path,
      sourceText,
      text: stored?.text?.trim() || sourceText,
      status: stored?.status ?? null,
    };
  });
}

/** Counts rows not yet approved for the readable catalog tab badge. */
export function countPendingReadableCatalog(rows: readonly ReadableCatalogRow[]): number {
  return rows.filter((row) => row.status !== 'approved').length;
}

/** Tailwind text color class for readable catalog review state. */
export function readableCatalogTextColor(status: RowStatus): string {
  if (status === 'approved') return 'text-emerald-300/90';
  if (status === 'rejected') return 'text-red-300/85';
  return 'text-orange-300/85';
}

/** Builds spoken confirmation: fixed preamble + visit description only (no path). */
export function formatReadableLeafConfirmation(
  path: string,
  confirmationText: string,
  preamble: string | null,
): string {
  const text = stripTrailingCatalogPath(confirmationText, path);
  if (!text) return `Selezionato: ${path}`;
  const pre = preamble?.trim() || DEFAULT_CONFIRMATION_PREAMBLE;
  return `${pre} ${text}`;
}
