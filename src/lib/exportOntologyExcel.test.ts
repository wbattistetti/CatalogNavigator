/**
 * Tests for ontology Excel export table building.
 */
import { describe, expect, it } from 'vitest';
import { compileAgentBundle } from './compileAgentBundle';
import {
  applyWorksheetColumnWidths,
  buildOntologyExportTable,
  collectUsedCategoryNames,
  ONTOLOGY_EXPORT_DESCRIPTION_HEADER,
} from './exportOntologyExcel';
import type { Analysis } from './analysisTypes';
import type { TokenDictionary } from './tokenDictionary';
import { segmentAllDescriptions } from './tokenDictionary';

const dictionary: TokenDictionary = {
  descriptionColumn: 'descrizione',
  categories: [
    { id: 'c1', name: 'specialità', order: 0, tokenTexts: ['cardiologica'], type: 'attributo' },
    { id: 'c2', name: 'tipo visita', order: 1, tokenTexts: ['prima'], type: 'attributo' },
    { id: 'c3', name: 'esame', order: 2, tokenTexts: ['ecg'], type: 'attributo' },
    { id: 'c4', name: 'target', order: 3, tokenTexts: ['adulto', 'pediatrica'], type: 'attributo' },
    { id: 'c5', name: 'fascia di età', order: 4, tokenTexts: ['> 17 anni', 'da 6 anni a 15 anni'], type: 'vincolo' },
    { id: 'c6', name: 'categoria inutilizzata', order: 5, tokenTexts: ['mai usato'], type: 'attributo' },
  ],
  tokens: [
    { text: 'cardiologica', enabled: true },
    { text: 'prima', enabled: true },
    { text: 'ecg', enabled: true },
    { text: 'adulto', enabled: true },
    { text: 'pediatrica', enabled: true },
    { text: '> 17 anni', enabled: true },
    { text: 'da 6 anni a 15 anni', enabled: true },
    { text: 'mai usato', enabled: true },
  ],
};

const descriptions = [
  'prima visita cardiologica con ecg adulto > 17 anni',
  'prima visita cardiologica pediatrica da 6 anni a 15 anni',
];

const { leafPaths } = segmentAllDescriptions(
  descriptions,
  dictionary.tokens,
  dictionary.categories,
);

function buildAnalysis(): Analysis {
  const slots = new Set<string>();
  for (const path of leafPaths) {
    const parts = path.split('.');
    for (let i = 1; i <= parts.length; i++) {
      slots.add(parts.slice(0, i).join('.'));
    }
  }

  return {
    id: 'a1',
    document_id: 'd1',
    rows: [...slots].sort().map((slot) => ({
      slot_filling: slot,
      question: null,
      grammar: null,
      answer_grammar: null,
      no_match_1: null,
      no_match_2: null,
      no_match_3: null,
      confirmation_text: null,
    })),
    item_paths: leafPaths,
    start_question: null,
    confirmation_preamble: null,
    created_at: '',
    updated_at: '',
  };
}

describe('exportOntologyExcel', () => {
  it('includes only categories with at least one value in the catalog', () => {
    const bundle = compileAgentBundle({
      documentName: 'Visite',
      dictionary,
      descriptions,
      analysis: buildAnalysis(),
    });

    const used = collectUsedCategoryNames(bundle.corpusItems, dictionary.categories!);
    expect(used).toContain('specialità');
    expect(used).toContain('fascia di età');
    expect(used).not.toContain('categoria inutilizzata');
  });

  it('builds rows with description and category values', () => {
    const analysis = buildAnalysis();
    const adultPath = analysis.item_paths!.find((p) => p.includes('adulto'))!;
    const bundle = compileAgentBundle({
      documentName: 'Visite',
      dictionary,
      descriptions,
      analysis,
      leafDescriptionMap: new Map([[adultPath, 'prima visita cardiologica con ecg']]),
    });

    const table = buildOntologyExportTable(bundle.corpusItems, dictionary.categories!);
    expect(table.headers[0]).toBe(ONTOLOGY_EXPORT_DESCRIPTION_HEADER);
    expect(table.headers).toContain('specialità');
    expect(table.headers).not.toContain('categoria inutilizzata');

    const adultRow = table.rows.find((row) => row[0] === 'prima visita cardiologica con ecg');
    expect(adultRow).toBeDefined();
    const specIdx = table.headers.indexOf('specialità');
    const ageIdx = table.headers.indexOf('fascia di età');
    expect(adultRow![specIdx]).toBe('cardiologica');
    expect(adultRow![ageIdx]).toBe('> 17 anni');
  });

  it('leaves empty cells for categories missing on an item', () => {
    const bundle = compileAgentBundle({
      documentName: 'Visite',
      dictionary,
      descriptions,
      analysis: buildAnalysis(),
    });

    const table = buildOntologyExportTable(bundle.corpusItems, dictionary.categories!);
    const esameIdx = table.headers.indexOf('esame');
    expect(esameIdx).toBeGreaterThanOrEqual(0);

    const rowsWithEcg = table.rows.filter((row) => row[esameIdx] === 'ecg');
    const rowsWithoutEcg = table.rows.filter((row) => row[esameIdx] === '');
    expect(rowsWithEcg.length).toBeGreaterThan(0);
    expect(rowsWithoutEcg.length).toBeGreaterThan(0);
  });

  it('sets column widths on the worksheet', () => {
    const bundle = compileAgentBundle({
      documentName: 'Visite',
      dictionary,
      descriptions,
      analysis: buildAnalysis(),
    });
    const table = buildOntologyExportTable(bundle.corpusItems, dictionary.categories!);
    const worksheet = {} as import('xlsx').WorkSheet;
    applyWorksheetColumnWidths(worksheet, table.headers, table.rows);
    expect(worksheet['!cols']).toHaveLength(table.headers.length);
    expect(worksheet['!cols']![0]).toMatchObject({ wch: expect.any(Number) });
  });
});
