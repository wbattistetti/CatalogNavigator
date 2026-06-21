/**
 * Tests for dialog test plan generation (one voice per document row).
 */
import { describe, expect, it } from 'vitest';
import type { AgentBundle } from '../agentBundleTypes';
import type { CompiledAgeConstraint } from '../agentBundleTypes';
import { buildGuidedPathToTarget } from '../compileDisambiguationPlan';
import type { RowSegmentation } from '../tokenDictionary';
import { generateDialogTestPlan } from './dialogTestPlanGenerate';
import { mergeOpeningTokensWithGuidedSteps } from './dialogTestPlanCanonicalScripts';

const minimalBundle: AgentBundle = {
  meta: {
    documentName: 'test',
    documentId: null,
    mode: 'preview',
    version: '1',
    compiledAt: '',
    warnings: [],
  },
  dictionary: {
    descriptionColumn: '',
    tokens: [],
    categories: [
      { id: 'c1', name: 'tipo', order: 0, tokenTexts: ['controllo'] },
    ],
  },
  analysis: { rows: [], item_paths: ['controllo'] },
  ontology: { rows: [], item_paths: ['controllo'] },
  itemPaths: ['controllo'],
  corpusItems: [{
    path: 'controllo',
    sourceText: 'VISITA A DI CONTROLLO; VISITA B DI CONTROLLO',
    segments: [{ text: 'controllo', categoryName: 'tipo', categoryType: 'attributo' }],
    unmatched: [],
    constraints: [],
  }],
};

const rows: RowSegmentation[] = [
  { rowIndex: 0, sourceText: 'VISITA A DI CONTROLLO', path: 'controllo', unmatched: [] },
  { rowIndex: 1, sourceText: 'VISITA B DI CONTROLLO', path: 'controllo', unmatched: [] },
];

describe('generateDialogTestPlan', () => {
  it('creates one voice per segmentation row when rows are provided', () => {
    const plan = generateDialogTestPlan(minimalBundle, rows);
    expect(plan.voices).toHaveLength(2);
    expect(plan.voices[0]?.sourceText).toBe('VISITA A DI CONTROLLO');
    expect(plan.voices[0]?.canonicalTokens).toEqual(['controllo']);
  });

  it('builds minimal script with one token per turn only', () => {
    const plan = generateDialogTestPlan(minimalBundle, rows);
    const minimal = plan.voices[0]!.scripts.minimal.userSteps;
    expect(minimal).toEqual(['controllo']);
  });

  it('orders guided steps by engine disambiguation (age before later tokens)', () => {
    const ageRule: CompiledAgeConstraint = {
      kind: 'age_years',
      categoryName: 'fascia età',
      askKey: 'age_years',
      min: 16,
      max: 16,
      minMonths: 192,
      maxMonths: 192,
      minWeeks: null,
      maxWeeks: null,
      sourceToken: '16 anni',
    };
    const bundle: AgentBundle = {
      ...minimalBundle,
      dictionary: {
        descriptionColumn: '',
        tokens: [],
        categories: [
          { id: 'c1', name: 'specialità', order: 0, tokenTexts: ['ginecologica'] },
          { id: 'c2', name: 'tipo visita', order: 1, tokenTexts: ['prima'] },
          { id: 'c3', name: 'fascia età', order: 2, tokenTexts: ['16 anni'] },
        ],
      },
      itemPaths: ['ginecologica.prima', 'ginecologica.controllo'],
      corpusItems: [
        {
          path: 'ginecologica.prima',
          sourceText: 'VISITA GINECOLOGICA PRIMA',
          segments: [
            { text: 'ginecologica', categoryName: 'specialità', categoryType: 'attributo' },
            { text: 'prima', categoryName: 'tipo visita', categoryType: 'attributo' },
          ],
          unmatched: [],
          constraints: [ageRule],
        },
        {
          path: 'ginecologica.controllo',
          sourceText: 'VISITA GINECOLOGICA CONTROLLO',
          segments: [
            { text: 'ginecologica', categoryName: 'specialità', categoryType: 'attributo' },
            { text: 'controllo', categoryName: 'tipo visita', categoryType: 'attributo' },
          ],
          unmatched: [],
          constraints: [ageRule],
        },
      ],
      analysis: { rows: [], item_paths: ['ginecologica.prima', 'ginecologica.controllo'] },
      ontology: { rows: [], item_paths: ['ginecologica.prima', 'ginecologica.controllo'] },
    };
    const guided = buildGuidedPathToTarget(
      bundle.corpusItems,
      bundle.dictionary.categories ?? [],
      'ginecologica.prima',
    );
    expect(guided.reachable).toBe(true);
    expect(mergeOpeningTokensWithGuidedSteps(
      guided.steps.map((s) => s.userText),
      ['ginecologica', 'prima', '16 anni'],
    )).toEqual(['ginecologica', '16 anni', 'prima']);

    const plan = generateDialogTestPlan(bundle, [{
      rowIndex: 0,
      sourceText: 'VISITA GINECOLOGICA PRIMA',
      path: 'ginecologica.prima',
      unmatched: [],
    }]);
    expect(plan.voices[0]?.scripts.minimal.userSteps).toEqual(['ginecologica', '16 anni', 'prima']);
  });
});
