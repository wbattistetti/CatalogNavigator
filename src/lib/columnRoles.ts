/**
 * Column role helpers for tabular KB documents.
 * Roles are set via the Documento originale header toolbar (Descrizione | Selector | Data | Ignore).
 */
import type { ColumnRole, KbDocument } from './supabase';
import { supabase } from './supabase';
import { buildDeterministicTree, type ParsedTabular } from './parseTabular';

/** True when at least one column is marked Selector (gate for Ontologia tab). */
export function hasSelectorColumn(roles: Record<string, ColumnRole>): boolean {
  return Object.values(roles).some((r) => r === 'selector');
}

export interface OntologyTabVisibilityOptions {
  /** Saved taxonomy rows in kb_analysis. */
  hasSavedTaxonomy?: boolean;
  /** Legacy inline token_dictionary on the document. */
  hasTokenDictionary?: boolean;
}

/**
 * Whether the Ontologia tab should appear.
 * New projects need Selector; legacy projects may only have Descrizione or saved ontology.
 */
export function shouldShowOntologyTab(
  headers: string[],
  roles: Record<string, ColumnRole>,
  options: OntologyTabVisibilityOptions = {},
): boolean {
  if (hasSelectorColumn(roles)) return true;
  if (resolveDescriptionColumns(headers, roles).length > 0) return true;
  if (options.hasSavedTaxonomy) return true;
  if (options.hasTokenDictionary) return true;
  return false;
}

/** Columns marked Selector — navigable ontology dimensions (path segments). */
export function resolveSelectorColumns(
  headers: string[],
  roles: Record<string, ColumnRole>,
): string[] {
  return headers.filter((h) => roles[h] === 'selector');
}

/** Columns marked Data — leaf metadata, not asked to the patient. */
export function resolveDataColumns(
  headers: string[],
  roles: Record<string, ColumnRole>,
): string[] {
  return headers.filter((h) => roles[h] === 'data');
}

/** Columns marked Descrizione (legacy `ontology` role maps here). */
export function resolveDescriptionColumns(
  headers: string[],
  roles: Record<string, ColumnRole>,
): string[] {
  return headers.filter((h) => {
    const role = roles[h];
    return role === 'description' || role === 'ontology';
  });
}

/**
 * Columns used to build per-row corpus text in Ontologia.
 * Prefers Descrizione; if none, falls back to Selector column values.
 */
export function resolveCorpusColumns(
  headers: string[],
  roles: Record<string, ColumnRole>,
): string[] {
  const description = resolveDescriptionColumns(headers, roles);
  if (description.length > 0) return description;
  return resolveSelectorColumns(headers, roles);
}

/** True when corpus uses Selector columns because no Descrizione is set. */
export function corpusUsesSelectorFallback(
  headers: string[],
  roles: Record<string, ColumnRole>,
): boolean {
  return resolveDescriptionColumns(headers, roles).length === 0
    && resolveSelectorColumns(headers, roles).length > 0;
}

/**
 * @deprecated Use resolveDescriptionColumns. Kept for callers not yet renamed.
 */
export function resolveOntologyColumns(
  headers: string[],
  roles: Record<string, ColumnRole>,
): string[] {
  return resolveDescriptionColumns(headers, roles);
}

/** Resolve which header is the legacy single description column. */
export function resolveDescriptionColumn(
  headers: string[],
  roles: Record<string, ColumnRole>,
): string | null {
  const byRole = headers.find((h) => roles[h] === 'description' || roles[h] === 'ontology');
  if (byRole) return byRole;
  const byName = headers.find((h) => /descri/i.test(h));
  return byName ?? null;
}

/** Primary column label stored on token dictionaries (first description column). */
export function primaryOntologyColumn(columns: string[]): string | null {
  return columns[0] ?? null;
}

/** Suggest default description columns when none is configured. */
export function suggestOntologyColumns(
  headers: string[],
  roles: Record<string, ColumnRole> = {},
): string[] {
  const configured = resolveCorpusColumns(headers, roles);
  if (configured.length > 0) return configured;

  const byName = headers.find((h) => /descri/i.test(h));
  if (byName) return [byName];

  const notIgnored = headers.find((h) => roles[h] !== 'ignore');
  return notIgnored ? [notIgnored] : headers.length > 0 ? [headers[0]!] : [];
}

/** Suggest a default description column when none is configured. */
export function suggestDescriptionColumn(
  headers: string[],
  roles: Record<string, ColumnRole> = {},
): string {
  return suggestOntologyColumns(headers, roles)[0] ?? '';
}

/** Join selected tabular columns into one corpus line per row. */
export function buildRowOntologyText(
  row: string[],
  headers: string[],
  columns: string[],
): string {
  if (columns.length === 0) return '';
  const parts: string[] = [];
  for (const column of columns) {
    const idx = headers.indexOf(column);
    if (idx < 0) continue;
    const value = String(row[idx] ?? '').trim();
    if (value) parts.push(value);
  }
  return parts.join(' ');
}

/** Build corpus descriptions from tabular data and description columns. */
export function buildCorpusDescriptionsFromColumns(
  headers: string[],
  rows: string[][],
  columns: string[],
): string[] {
  if (columns.length === 0) return [];
  return rows.map((row) => buildRowOntologyText(row, headers, columns));
}

/**
 * Deterministic leaf paths from Selector (+ Data metadata) columns.
 * Returns empty when no selector columns are configured.
 */
export function buildSelectorLeafPaths(
  tabular: ParsedTabular,
  roles: Record<string, ColumnRole>,
): {
  leafPaths: string[];
  leafSourceData: Record<string, Array<Record<string, string>>>;
} {
  const selectorCols = resolveSelectorColumns(tabular.headers, roles);
  if (selectorCols.length === 0) {
    return { leafPaths: [], leafSourceData: {} };
  }
  const dataCols = resolveDataColumns(tabular.headers, roles);
  const { slots, leafSourceData } = buildDeterministicTree(tabular, selectorCols, dataCols);
  const leafPaths = slots.filter((slot) => {
    const depth = slot.split('.').length;
    return depth === selectorCols.length;
  });
  return { leafPaths, leafSourceData };
}

/** Assign description role to one column, clearing it from all others. @deprecated toolbar sets roles directly */
export function setDescriptionColumnRole(
  existingRoles: Record<string, ColumnRole>,
  headers: string[],
  columnName: string,
): Record<string, ColumnRole> {
  const newRoles = { ...existingRoles };
  for (const h of headers) {
    if (h !== columnName && (newRoles[h] === 'description' || newRoles[h] === 'ontology')) {
      delete newRoles[h];
    }
  }
  newRoles[columnName] = 'description';
  return newRoles;
}

/** @deprecated Column roles are set on Documento originale toolbar, not from Ontologia UI. */
export function setOntologyColumnRoles(
  existingRoles: Record<string, ColumnRole>,
  headers: string[],
  selectedColumns: string[],
): Record<string, ColumnRole> {
  const selected = new Set(selectedColumns);
  const newRoles: Record<string, ColumnRole> = { ...existingRoles };

  for (const h of headers) {
    if (selected.has(h)) {
      newRoles[h] = 'description';
    } else if (newRoles[h] === 'ontology' || newRoles[h] === 'description') {
      delete newRoles[h];
    }
  }

  return newRoles;
}

/** Persist column roles and return the refreshed document row. */
export async function persistDocumentColumnRoles(
  docId: string,
  columnRoles: Record<string, ColumnRole>,
): Promise<KbDocument> {
  const { error } = await supabase
    .from('kb_documents')
    .update({ column_roles: columnRoles })
    .eq('id', docId);

  if (error) throw new Error(error.message);

  const { data: fresh, error: fetchErr } = await supabase
    .from('kb_documents')
    .select('*')
    .eq('id', docId)
    .maybeSingle();

  if (fetchErr || !fresh) {
    throw new Error(fetchErr?.message ?? 'Documento non ricaricato');
  }

  return fresh as KbDocument;
}
