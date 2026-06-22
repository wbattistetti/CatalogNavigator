/**
 * Tests for AgentBundle compilation.
 */
import { describe, expect, it } from 'vitest';
import { compileAgentBundle } from './compileAgentBundle';
import { resolveCorpusItemPaths } from './corpusItemPaths';
import { segmentAllDescriptions } from './tokenDictionary';
import type { Analysis } from './analysisTypes';
import type { TokenDictionary } from './tokenDictionary';

const dictionary: TokenDictionary = {
  descriptionColumn: 'descrizione',
  categories: [
    { id: 'c1', name: 'specialità', order: 0, tokenTexts: ['cardiologica'], type: 'attributo' },
    { id: 'c2', name: 'tipo visita', order: 1, tokenTexts: ['prima'], type: 'attributo' },
    { id: 'c3', name: 'target', order: 2, tokenTexts: ['adulto', 'pediatrica'], type: 'attributo' },
    { id: 'c4', name: 'fascia di età', order: 3, tokenTexts: ['> 17 anni', 'da 6 anni a 15 anni'], type: 'vincolo' },
  ],
  tokens: [
    { text: 'cardiologica', enabled: true },
    { text: 'prima', enabled: true },
    { text: 'adulto', enabled: true },
    { text: 'pediatrica', enabled: true },
    { text: '> 17 anni', enabled: true },
    { text: 'da 6 anni a 15 anni', enabled: true },
  ],
};

const descriptions = [
  'prima visita cardiologica adulto > 17 anni',
  'prima visita cardiologica pediatrica da 6 anni a 15 anni',
];

function buildAnalysis(): Analysis {
  const { leafPaths } = segmentAllDescriptions(
    descriptions,
    dictionary.tokens,
    dictionary.categories,
  );

  return {
    id: 'a1',
    document_id: 'd1',
    rows: [],
    item_paths: leafPaths,
    start_question: 'Come posso aiutarla?',
    confirmation_preamble: 'Confermo:',
    created_at: '',
    updated_at: '',
  };
}

describe('compileAgentBundle', () => {
  it('materializes corpus items from live segmentation with age constraints', () => {
    const analysis = buildAnalysis();
    const bundle = compileAgentBundle({
      documentName: 'Visite',
      documentId: 'd1',
      mode: 'preview',
      dictionary,
      descriptions,
      analysis,
    });

    expect(bundle.corpusItems).toHaveLength(2);
    expect(bundle.itemPaths).toHaveLength(2);
    expect(bundle.ontology).toBe(bundle.analysis);
    expect(bundle.meta.version).toBe('1.2');

    const adult = bundle.corpusItems.find((i) => i.path.includes('adulto'));
    expect(adult?.constraints).toHaveLength(1);
    expect(adult?.constraints[0]).toMatchObject({
      kind: 'age_years',
      min: 18,
      max: null,
      sourceToken: '> 17 anni',
    });

    const ped = bundle.corpusItems.find((i) => i.path.includes('pediatrica'));
    expect(ped?.constraints[0]).toMatchObject({
      kind: 'age_years',
      min: 6,
      max: 15,
      minMonths: 72,
      maxMonths: 191,
      minWeeks: 312,
      maxWeeks: 831,
    });
  });

  it('throws when ontology is missing', () => {
    expect(() => compileAgentBundle({
      documentName: 'X',
      dictionary,
      descriptions,
      analysis: null,
    })).toThrow(/Ontologia mancante/);
  });

  it('builds runtime paths from live corpus segmentation, not saved item_paths', () => {
    const analysis = buildAnalysis();
    const staleDescriptions = ['prima', 'controllo', 'testo senza token utili'];

    const bundle = compileAgentBundle({
      documentName: 'Visite',
      documentId: 'd1',
      mode: 'preview',
      dictionary,
      descriptions: staleDescriptions,
      analysis,
    });

    const livePaths = resolveCorpusItemPaths({ descriptions: staleDescriptions, dictionary });
    expect(bundle.itemPaths).toEqual(livePaths);
    expect(bundle.itemPaths).not.toEqual(analysis.item_paths);
    expect(bundle.corpusItems).toHaveLength(livePaths.length);
  });

  it('throws when corpus descriptions are empty', () => {
    expect(() => compileAgentBundle({
      documentName: 'X',
      dictionary,
      descriptions: [],
      analysis: buildAnalysis(),
    })).toThrow(/Nessuna descrizione nel corpus/);
  });

  it('uses leafDescriptionMap for sourceText without changing paths', () => {
    const analysis = buildAnalysis();
    const adultPath = analysis.item_paths!.find((p) => p.includes('adulto'))!;
    const bundle = compileAgentBundle({
      documentName: 'Visite',
      dictionary,
      descriptions,
      analysis,
      leafDescriptionMap: new Map([[adultPath, 'descrizione grezza adulto']]),
    });

    const adult = bundle.corpusItems.find((i) => i.path === adultPath);
    expect(adult?.sourceText).toBe('descrizione grezza adulto');
    expect(adult?.path).toBe(adultPath);
  });
});
