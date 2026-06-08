import * as XLSX from 'xlsx';

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

export async function xlsxToTabular(file: File): Promise<{ tabular: ParsedTabular; headers: string[] }> {
  const ab = await file.arrayBuffer();
  const wb = XLSX.read(ab);
  const ws = wb.Sheets[wb.SheetNames[0]];
  // defval fills empty cells so rows are not jagged
  const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' });

  if (!data || data.length < 2) {
    return { tabular: { headers: [], rows: [] }, headers: [] };
  }

  // Number of columns = widest row across the whole sheet
  const colCount = Math.max(...data.map((row) => (row as string[]).length));

  // Build headers from first row; fall back to "Col N" for empty/missing cells
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
