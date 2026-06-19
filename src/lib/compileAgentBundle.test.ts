/**
 * Tests for AgentBundle compilation.
 */
import { describe, expect, it } from 'vitest';
import { compileAgentBundle } from './compileAgentBundle';
import { resolveItemPaths } from './itemPaths';
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

  const rows = [...slots].sort().map((slot) => ({
    slot_filling: slot,
    question: null,
    grammar: null,
    answer_grammar: null,
    no_match_1: null,
    no_match_2: null,
    no_match_3: null,
    confirmation_text: slot.endsWith('adulto')
      ? 'Visita cardiologica adulta'
      : slot.endsWith('pediatrica')
        ? 'Visita cardiologica pediatrica'
        : null,
  }));

  return {
    id: 'a1',
    document_id: 'd1',
    rows,
    item_paths: leafPaths,
    start_question: 'Come posso aiutarla?',
    confirmation_preamble: 'Confermo:',
    created_at: '',
    updated_at: '',
  };
}

describe('compileAgentBundle', () => {
  it('materializes corpus items from saved ontology paths with age constraints', () => {
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

  it('does not re-segment descriptions when building runtime paths', () => {
    const analysis = buildAnalysis();
    const expectedPaths = resolveItemPaths(
      analysis.rows.map((r) => r.slot_filling),
      analysis.item_paths,
    );

    const bundle = compileAgentBundle({
      documentName: 'Visite',
      documentId: 'd1',
      mode: 'preview',
      dictionary,
      descriptions: ['prima', 'controllo', 'testo senza token utili'],
      analysis,
    });

    expect(bundle.itemPaths).toEqual(expectedPaths);
    expect(bundle.corpusItems).toHaveLength(expectedPaths.length);
    expect(new Set(bundle.corpusItems.map((i) => i.path)).size).toBe(expectedPaths.length);
    expect(bundle.corpusItems.every((i) => !['prima', 'controllo'].includes(i.path))).toBe(true);
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
