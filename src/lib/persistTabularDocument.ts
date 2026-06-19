/**
 * Persists edited tabular document rows back to Supabase storage.
 */
import { isSpreadsheetFormat } from './fileFormat';
import {
  serializeTabularWithSeparator,
  tabularToXlsxBuffer,
  type ParsedTabular,
} from './parseTabular';
import { supabase, type KbDocument } from './supabase';

export interface PersistTabularOptions {
  csvSeparator?: '\t' | ';' | ',';
}

function tabularToBlob(doc: KbDocument, tabular: ParsedTabular, options: PersistTabularOptions): Blob {
  if (isSpreadsheetFormat(doc.format, doc.name)) {
    const buffer = tabularToXlsxBuffer(tabular);
    return new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  if (doc.format === 'csv' || doc.name.toLowerCase().endsWith('.csv')) {
    const separator = options.csvSeparator ?? '\t';
    const text = serializeTabularWithSeparator(tabular, separator);
    return new Blob([text], { type: 'text/csv;charset=utf-8' });
  }

  if (tabular.headers.length === 1 && tabular.headers[0] === 'descrizione') {
    const text = tabular.rows.map((row) => row[0] ?? '').join('\n');
    return new Blob([text], { type: 'text/plain;charset=utf-8' });
  }

  const text = serializeTabularWithSeparator(tabular, options.csvSeparator ?? '\t');
  return new Blob([text], { type: 'text/plain;charset=utf-8' });
}

/** Overwrites the stored source file with the given tabular snapshot. */
export async function persistTabularDocument(
  doc: KbDocument,
  tabular: ParsedTabular,
  options: PersistTabularOptions = {},
): Promise<KbDocument> {
  const blob = tabularToBlob(doc, tabular, options);

  const { error: uploadErr } = await supabase.storage
    .from('kb-documents')
    .update(doc.storage_path, blob, { upsert: true });

  if (uploadErr) throw new Error(uploadErr.message);

  const { data: fresh, error: fetchErr } = await supabase
    .from('kb_documents')
    .update({ file_size: blob.size })
    .eq('id', doc.id)
    .select('*')
    .maybeSingle();

  if (fetchErr || !fresh) {
    throw new Error(fetchErr?.message ?? 'Documento non ricaricato dopo il salvataggio');
  }

  return fresh as KbDocument;
}
