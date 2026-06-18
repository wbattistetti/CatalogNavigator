/**
 * Column role helpers for tabular KB documents.
 */
import type { ColumnRole, KbDocument } from './supabase';
import { supabase } from './supabase';

/** Resolve which header is the legacy single description column. */
export function resolveDescriptionColumn(
  headers: string[],
  roles: Record<string, ColumnRole>,
): string | null {
  const byRole = headers.find((h) => roles[h] === 'description');
  if (byRole) return byRole;
  const byName = headers.find((h) => /descri/i.test(h));
  return byName ?? null;
}

/** Resolve ordered headers used to build ontology corpus text (multi-column). */
export function resolveOntologyColumns(
  headers: string[],
  roles: Record<string, ColumnRole>,
): string[] {
  const ontology = headers.filter((h) => roles[h] === 'ontology');
  if (ontology.length > 0) return ontology;

  return headers.filter((h) => roles[h] === 'description');
}

/** Primary column label stored on token dictionaries (first ontology column). */
export function primaryOntologyColumn(columns: string[]): string | null {
  return columns[0] ?? null;
}

/** Suggest default ontology columns when none is configured. */
export function suggestOntologyColumns(
  headers: string[],
  roles: Record<string, ColumnRole> = {},
): string[] {
  const configured = resolveOntologyColumns(headers, roles);
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

/** Build corpus descriptions from tabular data and selected ontology columns. */
export function buildCorpusDescriptionsFromColumns(
  headers: string[],
  rows: string[][],
  columns: string[],
): string[] {
  if (columns.length === 0) return [];
  return rows.map((row) => buildRowOntologyText(row, headers, columns));
}

/** Assign description role to one column, clearing it from all others. @deprecated use setOntologyColumnRoles */
export function setDescriptionColumnRole(
  existingRoles: Record<string, ColumnRole>,
  headers: string[],
  columnName: string,
): Record<string, ColumnRole> {
  return setOntologyColumnRoles(existingRoles, headers, [columnName]);
}

/** Assign ontology role to selected columns; clears legacy description roles. */
export function setOntologyColumnRoles(
  existingRoles: Record<string, ColumnRole>,
  headers: string[],
  selectedColumns: string[],
): Record<string, ColumnRole> {
  const selected = new Set(selectedColumns);
  const newRoles: Record<string, ColumnRole> = { ...existingRoles };

  for (const h of headers) {
    if (selected.has(h)) {
      newRoles[h] = 'ontology';
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
