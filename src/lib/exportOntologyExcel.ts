/**
 * Exports the compiled ontology catalog to a flat Excel workbook (description + category columns).
 */
import * as XLSX from 'xlsx';
import type { Analysis } from './analysisTypes';
import type { BundleCorpusItem } from './agentBundleTypes';
import { compileAgentBundle } from './compileAgentBundle';
import { normalizeCategoryOrders, type TokenCategory } from './dictionaryTree';
import type { LoadedDictionaryRef } from './multiDictionarySegment';
import { getPathOrderingCategories } from './pathCanonicalize';
import type { TokenDictionary } from './tokenDictionary';

export const ONTOLOGY_EXPORT_DESCRIPTION_HEADER = 'Descrizione';

export interface OntologyExportTable {
  headers: string[];
  rows: string[][];
}

export interface ExportOntologyExcelInput {
  documentName: string;
  dictionary: TokenDictionary;
  descriptions: string[];
  analysis: Analysis;
  loadedRefs?: LoadedDictionaryRef[];
  leafDescriptionMap?: ReadonlyMap<string, string> | Record<string, string>;
  dictionaryDirty?: boolean;
  analysisDirty?: boolean;
  pathsOutOfSync?: boolean;
}

/** Categories with at least one non-empty segment value, in dictionary order. */
export function collectUsedCategoryNames(
  corpusItems: BundleCorpusItem[],
  categoryOrder: TokenCategory[],
): string[] {
  const used = new Set<string>();
  for (const item of corpusItems) {
    for (const seg of item.segments) {
      const name = seg.categoryName.trim();
      const value = seg.text.trim();
      if (name && value) used.add(name);
    }
  }

  return normalizeCategoryOrders(categoryOrder)
    .map((cat) => cat.name)
    .filter((name) => used.has(name));
}

/**
 * Builds tabular export data: first column description, then one column per used category.
 */
export function buildOntologyExportTable(
  corpusItems: BundleCorpusItem[],
  categoryOrder: TokenCategory[],
): OntologyExportTable {
  const categoryColumns = collectUsedCategoryNames(corpusItems, categoryOrder);
  const headers = [ONTOLOGY_EXPORT_DESCRIPTION_HEADER, ...categoryColumns];

  const rows = corpusItems.map((item) => {
    const byCategory = new Map<string, string>();
    for (const seg of item.segments) {
      const name = seg.categoryName.trim();
      const value = seg.text.trim();
      if (name && value) byCategory.set(name, seg.text);
    }
    return [
      item.sourceText,
      ...categoryColumns.map((cat) => byCategory.get(cat) ?? ''),
    ];
  });

  return { headers, rows };
}

/** Sets worksheet column widths from cell content (avoids overflow markers in LibreOffice/Excel). */
export function applyWorksheetColumnWidths(
  worksheet: XLSX.WorkSheet,
  headers: string[],
  rows: string[][],
): void {
  worksheet['!cols'] = headers.map((header, colIdx) => {
    const maxLen = Math.max(
      header.length,
      ...rows.map((row) => String(row[colIdx] ?? '').length),
    );
    return { wch: Math.min(Math.max(maxLen + 2, 10), 60) };
  });
}

function sanitizeExportFilename(name: string): string {
  const trimmed = name.trim().replace(/[<>:"/\\|?*]/g, '_');
  return trimmed || 'ontologia';
}

function resolveCategoryOrder(input: ExportOntologyExcelInput): TokenCategory[] {
  if (input.loadedRefs?.length) {
    return getPathOrderingCategories(input.loadedRefs);
  }
  return normalizeCategoryOrders(input.dictionary.categories ?? []);
}

/** Compiles the catalog and triggers an .xlsx download in the browser. */
export function exportOntologyToExcel(input: ExportOntologyExcelInput): void {
  const bundle = compileAgentBundle({
    documentName: input.documentName,
    documentId: input.analysis.document_id,
    dictionary: input.dictionary,
    descriptions: input.descriptions,
    analysis: input.analysis,
    loadedRefs: input.loadedRefs,
    leafDescriptionMap: input.leafDescriptionMap,
    dictionaryDirty: input.dictionaryDirty,
    analysisDirty: input.analysisDirty,
    pathsOutOfSync: input.pathsOutOfSync,
  });

  const table = buildOntologyExportTable(bundle.corpusItems, resolveCategoryOrder(input));
  const worksheet = XLSX.utils.aoa_to_sheet([table.headers, ...table.rows]);
  applyWorksheetColumnWidths(worksheet, table.headers, table.rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Ontologia');

  const filename = `${sanitizeExportFilename(input.documentName)}-ontologia.xlsx`;
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob(
    [bytes],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
