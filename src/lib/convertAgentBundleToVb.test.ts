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
import { readableCatalogKey } from './readableCatalog';
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
        { category: 'specialità', values: ['cardiologica'], kind: 'attributo' },
        { category: 'target', values: ['adulto'], kind: 'attributo' },
        { category: 'fascia di età', values: ['> 17 anni'], kind: 'vincolo' },
      ]),
    );
    expect(adult?.ageConstraints).toEqual([
      {
        categoryName: 'fascia di età',
        min: 18,
        max: null,
        minMonths: 216,
        maxMonths: null,
        minWeeks: 936,
        maxWeeks: null,
      },
    ]);

    expect(vb.ontology.categories).toHaveLength(4);
    expect(vb.ontology.startQuestion).toBe('Come posso aiutarla?');
    expect(vb.ontology.nodes.some((n) => n.confirmationText?.includes('adulto'))).toBe(true);
  });

  it('prefers readable catalog text over raw sourceText for VB nodes', () => {
    const analysis = buildAnalysis();
    const baseBundle = compileAgentBundle({
      documentName: 'Visite',
      documentId: 'd1',
      dictionary,
      descriptions,
      analysis,
    });
    const adultPath = baseBundle.itemPaths.find((p) => p.includes('adulto'));
    expect(adultPath).toBeTruthy();

    const adultSource = descriptions.find((d) => d.includes('adulto'));
    expect(adultSource).toBeTruthy();

    const bundle = compileAgentBundle({
      documentName: 'Visite',
      documentId: 'd1',
      dictionary,
      descriptions,
      analysis: {
        ...analysis,
        readable_catalog: {
          [readableCatalogKey(adultSource!)]: {
            text: 'Prima visita cardiologica per adulti',
            status: 'approved',
          },
        },
      },
    });

    const vb = convertAgentBundleToVb(bundle);
    const adultNode = vb.ontology.nodes.find((n) => n.path === adultPath);
    expect(adultNode?.confirmationText).toBe('Prima visita cardiologica per adulti');
  });

  it('round-trips pendingConstraint for ask_age between VB and TS session state', () => {
    const vbState = {
      acquiredConcepts: [{ category: 'specialità', values: ['cardiologica'], kind: 'attributo' }],
      selectedPath: null,
      noMatchCount: 0,
      pendingConstraint: {
        categoryName: 'fascia di età',
        valueKind: 'age_years',
        description: 'Età del paziente in anni come numero intero (es. "30").',
      },
    };

    const tsState = convertSessionStateFromVb(vbState);
    expect(tsState?.acquiredConcepts).toEqual([{ category: 'specialità', values: ['cardiologica'], kind: 'attributo' }]);
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

  it('round-trips exactAttributoCategories between VB and TS session state', () => {
    const vbState = {
      acquiredConcepts: [
        { category: 'varie', values: ['venoso'], kind: 'attributo' },
      ],
      exactAttributoCategories: ['varie'],
      selectedPath: null,
      noMatchCount: 0,
    };

    const tsState = convertSessionStateFromVb(vbState);
    expect(tsState?.exactAttributoCategories).toEqual(['varie']);

    const backToVb = convertSessionStateToVb(tsState);
    expect(backToVb?.exactAttributoCategories).toEqual(['varie']);
  });

  it('clears pendingConstraint when TS session has no pendingExpectedInput', () => {
    const tsState = {
      acquiredConcepts: [{ category: 'specialità', values: ['cardiologica'] }],
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
        answer_grammar: {
          regex: '(?P<adulto>adulto|uomo|maggiorenne)|(?P<pediatrica>minore|bambino|pediatrica)',
          mappings: { adulto: 'adulto', pediatrica: 'pediatrica' },
        },
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

  it('auto-compiles answer_grammar from options when missing from storage', () => {
    const analysis = buildAnalysis();
    analysis.disambiguation_plan = {
      computedAt: '2026-06-18T12:00:00.000Z',
      messages: [{
        signature: 'target||adulto|pediatrica||choice',
        categoryName: 'target',
        options: ['adulto', 'pediatrica'],
        style: 'choice',
        question: 'La visita è per un adulto o per un minore?',
        no_match_1: null,
        no_match_2: null,
        no_match_3: null,
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
    expect(vb.ontology.disambiguationPlan?.messages[0]?.answerGrammar?.regex).toBeTruthy();
    expect(vb.ontology.disambiguationPlan?.messages[0]?.answerGrammar?.mappings).toBeTruthy();
  });

  it('auto-compiles optional_include answer grammar from options', () => {
    const analysis = buildAnalysis();
    analysis.disambiguation_plan = {
      computedAt: '2026-06-18T12:00:00.000Z',
      messages: [{
        signature: 'sotto specialità||ortopedica||optional_include',
        categoryName: 'sotto specialità',
        options: ['ortopedica', 'none'],
        style: 'optional_include',
        question: 'Vuole anche la visita ortopedica?',
        no_match_1: null,
        no_match_2: null,
        no_match_3: null,
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
    expect(vb.ontology.disambiguationPlan?.messages[0]?.answerGrammar?.regex).toContain('ortopedica');
  });

  it('syncs stale category grammars with dictionary aliases at VB export', () => {
    const surgicalDictionary: TokenDictionary = {
      ...dictionary,
      categories: [{
        id: 'c-surg',
        name: 'specialità',
        order: 0,
        tokenTexts: ['chirurgia'],
        type: 'attributo',
        grammar: {
          regex: '(?<chirurgia>chirurgia)',
          mappings: { chirurgia: 'chirurgia' },
        },
      }],
      tokens: [
        { text: 'chirurgia', enabled: true },
        { text: 'chirurgica', enabled: true, aliasOf: 'chirurgia' },
      ],
    };

    const bundle = compileAgentBundle({
      documentName: 'Visite',
      documentId: 'd1',
      dictionary: surgicalDictionary,
      descriptions: ['visita chirurgica generale'],
      analysis: {
        ...buildAnalysis(),
        item_paths: ['chirurgia.generale'],
      },
    });

    const vb = convertAgentBundleToVb(bundle);
    const specialita = vb.ontology.categories.find((c) => c.name === 'specialità');
    expect(specialita?.grammar?.regex).toContain('chirurgica');
  });

  it('groups multiple segments for the same category into one concept values array', () => {
    const bundle = compileAgentBundle({
      documentName: 'Esami',
      dictionary: {
        ...dictionary,
        categories: [
          ...dictionary.categories,
          { id: 'c5', name: 'esami', order: 4, tokenTexts: ['ecg', 'eco_doppler'], type: 'attributo' },
        ],
        tokens: [
          ...dictionary.tokens,
          { text: 'ecg', enabled: true },
          { text: 'eco_doppler', enabled: true },
        ],
      },
      descriptions: ['visita cardiologica prima con ecg e eco_doppler'],
      analysis: {
        ...buildAnalysis(),
        item_paths: ['cardiologica.prima.ecg.eco_doppler'],
        rows: [
          ...buildAnalysis().rows,
          {
            slot_filling: 'cardiologica.prima.ecg.eco_doppler',
            question: null,
            grammar: null,
            answer_grammar: null,
            no_match_1: null,
            no_match_2: null,
            no_match_3: null,
            confirmation_text: 'Visita con ECG e ECO doppler',
            status: null,
          },
        ],
      },
    });

    const vb = convertAgentBundleToVb(bundle);
    const item = vb.catalog.items.find((i) => i.path.includes('eco_doppler'));
    const esami = item?.concepts.find((c) => c.category === 'esami');
    expect(esami?.values).toEqual(['ecg', 'eco_doppler']);
  });
});
