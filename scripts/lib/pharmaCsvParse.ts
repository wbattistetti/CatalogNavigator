/**
 * Parses the Italian veterinary medicines CSV (semicolon-separated).
 */
import { readFileSync } from 'node:fs';

export interface PharmaCsvRow {
  rowIndex: number;
  fields: Record<string, string>;
}

const DEFAULT_HEADERS = [
  'medicinale_veterinario',
  'codice_aic',
  'codice_gtin',
  'descrizione_confezione',
  'principio_attivo',
  'specie',
  'atc_vet',
  'ragione_sociale',
  'modalita_prescrizione',
  'data_inizio_commercializzazione',
  'data_fine_commercializzazione',
  'informazioni_aggiuntive',
] as const;

function parseSemicolonLine(line: string): string[] {
  return line.split(';').map((cell) => cell.trim());
}

/** Reads all data rows from the FRM_VET CSV. */
export function readPharmaCsv(filePath: string): PharmaCsvRow[] {
  const raw = readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headerCells = parseSemicolonLine(lines[0]!);
  const headers = headerCells.length >= 10 ? headerCells : [...DEFAULT_HEADERS];

  const rows: PharmaCsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseSemicolonLine(lines[i]!);
    const fields: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c]!;
      const value = cells[c] ?? '';
      if (value && value !== '-') fields[key] = value;
    }
    if (Object.keys(fields).length === 0) continue;
    rows.push({ rowIndex: i, fields });
  }
  return rows;
}

/** Compact text block for one row (all non-empty fields, labels not trusted for classification). */
export function rowToPromptBlock(row: PharmaCsvRow): string {
  const parts = Object.entries(row.fields).map(([k, v]) => `${k}: ${v}`);
  return `[riga ${row.rowIndex}] ${parts.join(' | ')}`;
}
