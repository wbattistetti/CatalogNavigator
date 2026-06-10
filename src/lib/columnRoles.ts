/**
 * Column role helpers for tabular KB documents.
 */
import type { ColumnRole, KbDocument } from './supabase';
import { supabase } from './supabase';

/** Resolve which header is the item description column. */
export function resolveDescriptionColumn(
  headers: string[],
  roles: Record<string, ColumnRole>,
): string | null {
  const byRole = headers.find((h) => roles[h] === 'description');
  if (byRole) return byRole;
  const byName = headers.find((h) => /descri/i.test(h));
  return byName ?? null;
}

/** Suggest a default description column when none is configured. */
export function suggestDescriptionColumn(
  headers: string[],
  roles: Record<string, ColumnRole> = {},
): string {
  const byName = headers.find((h) => /descri/i.test(h));
  if (byName) return byName;
  const notIgnored = headers.find((h) => roles[h] !== 'ignore');
  return notIgnored ?? headers[0] ?? '';
}

/** Assign description role to one column, clearing it from all others. */
export function setDescriptionColumnRole(
  existingRoles: Record<string, ColumnRole>,
  headers: string[],
  columnName: string,
): Record<string, ColumnRole> {
  const newRoles: Record<string, ColumnRole> = { ...existingRoles, [columnName]: 'description' };
  for (const h of headers) {
    if (h !== columnName && newRoles[h] === 'description') delete newRoles[h];
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
