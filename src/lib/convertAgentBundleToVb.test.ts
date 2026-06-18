/**
 * Tests for TS → VB AgentBundle conversion.
 */
import { describe, expect, it } from 'vitest';
import { compileAgentBundle } from './compileAgentBundle';
import {
  convertAgentBundleToVb,
  convertSessionStateFromVb,
  convertSessionStateToVb,
} from './convertAgentBundleToVb';
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
  const { leafPaths } = segmentAllDescriptions(descriptions, dictionary.tokens, dictionary.categories);
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

describe('convertAgentBundleToVb', () => {
  it('maps corpusItems to catalog.items with concepts and age constraints', () => {
    const bundle = compileAgentBundle({
      documentName: 'Visite',
      documentId: 'd1',
      dictionary,
      descriptions,
      analysis: buildAnalysis(),
    });

    const vb = convertAgentBundleToVb(bundle);

    expect(vb.catalog.items).toHaveLength(2);
    expect(vb.catalog.items[0]?.concepts.length).toBeGreaterThan(0);
    expect(vb.catalog.items.some((i) => i.path.includes('adulto'))).toBe(true);

    const adult = vb.catalog.items.find((i) => i.path.includes('adulto'));
    expect(adult?.concepts).toEqual(
      expect.arrayContaining([
        { category: 'specialità', value: 'cardiologica', kind: 'attributo' },
        { category: 'target', value: 'adulto', kind: 'attributo' },
        { category: 'fascia di età', value: '> 17 anni', kind: 'vincolo' },
      ]),
    );
    expect(adult?.ageConstraints).toEqual([
      { categoryName: 'fascia di età', min: 18, max: null },
    ]);

    expect(vb.ontology.categories).toHaveLength(4);
    expect(vb.ontology.startQuestion).toBe('Come posso aiutarla?');
    expect(vb.ontology.nodes.some((n) => n.confirmationText?.includes('adulta'))).toBe(true);
  });

  it('round-trips pendingConstraint for ask_age between VB and TS session state', () => {
    const vbState = {
      acquiredConcepts: [{ category: 'specialità', value: 'cardiologica', kind: 'attributo' }],
      selectedPath: null,
      noMatchCount: 0,
      pendingConstraint: {
        categoryName: 'fascia di età',
        valueKind: 'age_years',
        description: 'Età del paziente in anni come numero intero (es. "30").',
      },
    };

    const tsState = convertSessionStateFromVb(vbState);
    expect(tsState?.acquiredConcepts).toEqual([{ category: 'specialità', value: 'cardiologica', kind: 'attributo' }]);
    expect(tsState?.pendingExpectedInput).toEqual([
      {
        categoryName: 'fascia di età',
        valueKind: 'age_years',
        description: 'Età del paziente in anni come numero intero (es. "30").',
      },
    ]);

    const backToVb = convertSessionStateToVb(tsState);
    expect(backToVb?.pendingConstraint).toEqual(vbState.pendingConstraint);
  });

  it('clears pendingConstraint when TS session has no pendingExpectedInput', () => {
    const tsState = {
      acquiredConcepts: [{ category: 'specialità', value: 'cardiologica' }],
      selectedPath: null,
      noMatchCount: 0,
      pendingExpectedInput: null,
    };

    expect(convertSessionStateToVb(tsState)?.pendingConstraint).toBeNull();
  });

  it('does not emit legacy corpusItems keys', () => {
    const bundle = compileAgentBundle({
      documentName: 'Visite',
      dictionary,
      descriptions,
      analysis: buildAnalysis(),
    });
    const vb = convertAgentBundleToVb(bundle);
    expect(vb).not.toHaveProperty('corpusItems');
    expect(vb.catalog).toBeDefined();
    expect(vb.catalog.items.length).toBe(bundle.corpusItems.length);
  });

  it('exports disambiguation plan messages when present on analysis', () => {
    const analysis = buildAnalysis();
    analysis.disambiguation_plan = {
      computedAt: '2026-06-18T12:00:00.000Z',
      messages: [{
        signature: 'target||adulto|pediatrica||choice',
        categoryName: 'target',
        options: ['adulto', 'pediatrica'],
        style: 'choice',
        question: 'La visita è per un adulto o per un minore?',
        no_match_1: 'Non ho capito.',
        no_match_2: 'Può ripetere?',
        no_match_3: 'Adulto o minore?',
        contextCount: 1,
      }],
    };

    const bundle = compileAgentBundle({
      documentName: 'Visite',
      documentId: 'd1',
      dictionary,
      descriptions,
      analysis,
    });

    const vb = convertAgentBundleToVb(bundle);

    expect(vb.ontology.disambiguationPlan?.messages).toHaveLength(1);
    expect(vb.ontology.disambiguationPlan?.messages[0]?.question).toBe(
      'La visita è per un adulto o per un minore?',
    );
    expect(vb.ontology.disambiguationPlan?.messages[0]?.noMatch1).toBe('Non ho capito.');
    expect(vb.ontology.disambiguationPlan?.messages[0]?.answerGrammar?.regex).toBeTruthy();
    expect(vb.ontology.disambiguationPlan?.messages[0]?.answerGrammar?.mappings).toBeTruthy();
  });
});
