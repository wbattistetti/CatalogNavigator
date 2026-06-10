import * as XLSX from 'xlsx';
import { isSpreadsheetFormat } from './fileFormat';
import type { KbFileFormat } from './supabase';

export interface ParsedTabular {
  headers: string[];
  rows: string[][];
}

export function parseTabularText(text: string): ParsedTabular | null {
  const lines = text.trim().split('\n').filter((l) => l.trim());
  if (lines.length < 2) return null;

  const separator = lines[0].includes('\t') ? '\t' : ',';
  const headers = lines[0].split(separator).map((h) => h.trim().replace(/^"|"$/g, ''));
  if (headers.length < 2) return null;

  const rows = lines
    .slice(1)
    .map((line) => line.split(separator).map((cell) => cell.trim().replace(/^"|"$/g, '')))
    .filter((row) => row.some((cell) => cell !== ''));
  return { headers, rows };
}

/** One non-empty line per row — typical for plain .txt exam lists. */
export function parseDescriptionList(text: string): ParsedTabular | null {
  const lines = text.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  return {
    headers: ['descrizione'],
    rows: lines.map((line) => [line]),
  };
}

/** CSV/TSV first, then single-column description list. */
export function parseTextForDictionary(text: string): ParsedTabular | null {
  return parseTabularText(text) ?? parseDescriptionList(text);
}

function normalizeSlotLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build the slot-filling tree deterministically from a structured table.
 * Each row's selector column values become path segments, joined with dots.
 * The tree is fully expanded (all ancestor paths included) and sorted
 * parents-before-children, alphabetically within each depth level.
 * Data-column values are collected per leaf path for later joining.
 */
export function buildDeterministicTree(
  tabular: ParsedTabular,
  selectorCols: string[],
  dataCols: string[],
): {
  slots: string[];
  leafSourceData: Record<string, Array<Record<string, string>>>;
} {
  const selectorIdxs = selectorCols
    .map((col) => tabular.headers.indexOf(col))
    .filter((i) => i >= 0);
  const dataIdxs = dataCols.map((col) => tabular.headers.indexOf(col));

  const allPaths = new Set<string>();
  const leafSourceData: Record<string, Array<Record<string, string>>> = {};

  for (const row of tabular.rows) {
    const parts = selectorIdxs
      .map((idx) => normalizeSlotLabel(row[idx] ?? ''))
      .filter(Boolean);

    if (parts.length === 0) continue;

    const leafPath = parts.join('.');
    allPaths.add(leafPath);

    // Expand all ancestor paths
    for (let depth = 1; depth < parts.length; depth++) {
      allPaths.add(parts.slice(0, depth).join('.'));
    }

    // Collect data-column values for this source row
    const dataObj: Record<string, string> = {};
    dataCols.forEach((col, j) => {
      const idx = dataIdxs[j];
      if (idx !== undefined && idx >= 0) dataObj[col] = row[idx] ?? '';
    });
    if (Object.values(dataObj).some(Boolean)) {
      if (!leafSourceData[leafPath]) leafSourceData[leafPath] = [];
      leafSourceData[leafPath].push(dataObj);
    }
  }

  // Sort: shallower nodes first; alphabetically within the same depth
  const slots = [...allPaths].sort((a, b) => {
    const da = a.split('.').length;
    const db = b.split('.').length;
    return da !== db ? da - db : a.localeCompare(b, 'it');
  });

  return { slots, leafSourceData };
}

/** Build the text to send to AI (only selector columns, rows tagged [R0]…)
 *  and a parallel array of data-column values for each source row. */
export function buildSelectorText(
  tabular: ParsedTabular,
  selectorCols: string[],
  dataCols: string[],
): { selectorText: string; dataRowMap: Array<Record<string, string>> } {
  const selectorIdxs = selectorCols
    .map((col) => tabular.headers.indexOf(col))
    .filter((i) => i >= 0);
  const dataIdxs = dataCols.map((col) => tabular.headers.indexOf(col));

  const headerLine = selectorCols
    .filter((_, i) => selectorIdxs[i] !== undefined && selectorIdxs[i]! >= 0)
    .join(' | ');

  const rowLines = tabular.rows.map((row, i) => {
    const vals = selectorIdxs.map((idx) => row[idx] ?? '').filter(Boolean);
    return `[R${i}] ${vals.join(' | ')}`;
  });

  const selectorText = [headerLine, ...rowLines].join('\n');

  const dataRowMap: Array<Record<string, string>> = tabular.rows.map((row) => {
    const obj: Record<string, string> = {};
    dataCols.forEach((col, j) => {
      const idx = dataIdxs[j];
      if (idx !== undefined && idx >= 0) obj[col] = row[idx] ?? '';
    });
    return obj;
  });

  return { selectorText, dataRowMap };
}

/** ZIP (xlsx) or OLE (xls) magic — must not be parsed with res.text(). */
export function looksLikeBinarySpreadsheet(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return true;
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return true;
  return false;
}

export function looksLikeMisParsedSpreadsheetText(text: string): boolean {
  const head = text.trimStart().slice(0, 4);
  if (head.startsWith('PK')) return true;
  return head.length > 0 && head.charCodeAt(0) === 0xd0;
}

export function serializeTabular(tabular: ParsedTabular): string {
  return [tabular.headers.join('\t'), ...tabular.rows.map((r) => r.join('\t'))].join('\n');
}

/** Parse Excel workbook bytes into headers + rows (all sheet columns). */
export function xlsxBufferToTabular(ab: ArrayBuffer): { tabular: ParsedTabular; headers: string[] } {
  const wb = XLSX.read(ab, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    throw new Error('File Excel senza fogli');
  }
  const ws = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' });

  if (!data || data.length === 0) {
    throw new Error('Foglio Excel vuoto');
  }

  const colCount = Math.max(...data.map((row) => (row as string[]).length), 1);
  const rawHeaders = data[0] as string[];
  const headers = Array.from({ length: colCount }, (_, i) => {
    const h = String(rawHeaders[i] ?? '').trim();
    return h !== '' ? h : `Col ${i + 1}`;
  });

  const rows = data
    .slice(1)
    .map((row) =>
      Array.from({ length: colCount }, (_, i) => String((row as string[])[i] ?? '').trim()),
    )
    .filter((row) => row.some((cell) => cell !== ''));

  return { tabular: { headers, rows }, headers };
}

export async function xlsxToTabular(file: File): Promise<{ tabular: ParsedTabular; headers: string[] }> {
  return xlsxBufferToTabular(await file.arrayBuffer());
}

/** Load tabular data from raw bytes — spreadsheet (SheetJS) or CSV/text. */
export function loadTabularFromBuffer(
  ab: ArrayBuffer,
  fileName: string,
  format: KbFileFormat,
): ParsedTabular {
  const bytes = new Uint8Array(ab);
  const useSpreadsheet = isSpreadsheetFormat(format, fileName) || looksLikeBinarySpreadsheet(bytes);

  if (useSpreadsheet) {
    const { tabular } = xlsxBufferToTabular(ab);
    if (tabular.headers.length === 0) {
      throw new Error('Nessuna colonna trovata nel file Excel');
    }
    return tabular;
  }

  if (format === 'csv' || fileName.toLowerCase().endsWith('.csv')) {
    const text = new TextDecoder('utf-8').decode(ab);
    if (looksLikeMisParsedSpreadsheetText(text)) {
      throw new Error('Il file sembra Excel: usa estensione .xlsx o .xls');
    }
    const parsed = parseTabularText(text);
    if (!parsed) throw new Error('CSV non valido o senza intestazioni');
    return parsed;
  }

  const text = new TextDecoder('utf-8').decode(ab);
  if (looksLikeMisParsedSpreadsheetText(text)) {
    try {
      const { tabular } = xlsxBufferToTabular(ab);
      if (tabular.headers.length > 0) return tabular;
    } catch {
      throw new Error('File Excel non leggibile — verifica formato .xlsx');
    }
  }

  const parsed = parseTextForDictionary(text);
  if (!parsed) throw new Error('Impossibile interpretare il file come tabella');
  return parsed;
}

/** Column headers at upload time (xlsx + csv). */
export async function extractColumnHeadersFromFile(
  file: File,
  format: KbFileFormat,
): Promise<string[]> {
  const ab = await file.arrayBuffer();
  const tabular = loadTabularFromBuffer(ab, file.name, format);
  return tabular.headers;
}
