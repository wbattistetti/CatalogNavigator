/**
 * Tests for compileDisambiguationPlan — reachable graph and stats.
 */
import { describe, expect, it } from 'vitest';
import type { TokenCategory } from './dictionaryTree';
import type { BundleCorpusItem } from './agentBundleTypes';
import {
  buildDisambiguationSignature,
  buildExplorationStateKey,
  buildGuidedPathToTarget,
  compileDisambiguationPlan,
  fingerprintCandidatePathSet,
  inferQuestionStyle,
} from './compileDisambiguationPlan';
import { buildCorpusItemsFromPaths } from './slotExtract';
import { buildCorpusItemsWithConstraints } from './corpusItemCompile';

const baseCategories: TokenCategory[] = [
  { id: 'c1', name: 'specialità', order: 0, tokenTexts: ['cardiologica', 'allergologica'] },
  { id: 'c2', name: 'tipo visita', order: 1, tokenTexts: ['prima visita', 'controllo'] },
  { id: 'c3', name: 'fascia età', order: 2, tokenTexts: ['adulti', 'pediatrica'] },
];

const cardioPaths = [
  'cardiologica.prima visita.adulti',
  'cardiologica.prima visita.pediatrica',
  'cardiologica.controllo.adulti',
  'cardiologica.controllo.pediatrica',
  'allergologica.prima visita.adulti',
];

describe('inferQuestionStyle', () => {
  it('marks optional only when none plus a single real value', () => {
    expect(inferQuestionStyle(['ecodoppler', 'none'])).toBe('optional_include');
    expect(inferQuestionStyle(['prima', 'controllo'])).toBe('choice');
    expect(inferQuestionStyle(['allergologica', 'cardiologica', 'none'])).toBe('choice');
  });
});

describe('buildDisambiguationSignature', () => {
  it('normalizes optional signatures to category + single value', () => {
    expect(buildDisambiguationSignature('ECG', ['ecg', 'none'])).toBe('ECG||ecg||optional_include');
  });

  it('keeps full options for small multi-value choice', () => {
    expect(buildDisambiguationSignature('tipo visita', ['controllo', 'prima visita'])).toBe(
      'tipo visita||controllo|prima visita||choice',
    );
  });

  it('collapses large choice to compact copy signature', () => {
    const specialties = [
      'allergologica', 'cardiologica', 'dermatologica', 'ginecologica', 'neurologica', 'none',
    ];
    expect(buildDisambiguationSignature('specialità', specialties)).toBe(
      'specialità||__multi__||choice',
    );
  });
});

describe('fingerprintCandidatePathSet', () => {
  it('is order-independent for the same path set', () => {
    const a = fingerprintCandidatePathSet(['b.path', 'a.path']);
    const b = fingerprintCandidatePathSet(['a.path', 'b.path']);
    expect(a).toBe(b);
  });

  it('differs for different path sets', () => {
    const a = fingerprintCandidatePathSet(['a.path']);
    const b = fingerprintCandidatePathSet(['b.path']);
    expect(a).not.toBe(b);
  });
});

describe('buildExplorationStateKey', () => {
  it('uses compact fingerprints instead of full path joins', () => {
    const key = buildExplorationStateKey({}, ['a', 'b'], null);
    expect(key).not.toContain('a|b');
    expect(key).toContain('2:');
  });
});

describe('compileDisambiguationPlan — cardio fixture', () => {
  it('computes reachable disambiguation nodes from catalog', () => {
    const corpusItems = buildCorpusItemsWithConstraints(cardioPaths, baseCategories);
    const result = compileDisambiguationPlan({
      itemPaths: cardioPaths,
      categories: baseCategories,
      corpusItems,
    });

    expect(result.stats.catalogItemCount).toBe(5);
    expect(result.stats.totalStates).toBeGreaterThan(1);
    expect(result.stats.disambiguateNodes).toBeGreaterThan(0);
    expect(result.stats.uniqueDisambiguationBySignature).toBeLessThanOrEqual(
      result.stats.uniqueDisambiguationByFullKey,
    );
    expect(result.nodes.some((n) => n.categoryName === 'tipo visita')).toBe(true);
  });

  it('deduplicates signatures when same question applies in multiple contexts', () => {
    const corpusItems = buildCorpusItemsWithConstraints(cardioPaths, baseCategories);
    const result = compileDisambiguationPlan({
      itemPaths: cardioPaths,
      categories: baseCategories,
      corpusItems,
    });

    const tipoNodes = result.nodes.filter(
      (n) => n.action === 'disambiguate' && n.categoryName === 'tipo visita',
    );
    const signatures = new Set(tipoNodes.map((n) => n.signature));
    expect(signatures.size).toBe(1);
    expect(buildDisambiguationSignature('tipo visita', ['controllo', 'prima visita'])).toBe(
      signatures.values().next().value,
    );
  });
});

describe('compileDisambiguationPlan — optional category (none)', () => {
  const categories: TokenCategory[] = [
    { id: 'c1', name: 'specialità', order: 0, tokenTexts: ['cardiologica'] },
    { id: 'c2', name: 'tipo visita', order: 1, tokenTexts: ['prima visita'] },
    { id: 'c3', name: 'ECG', order: 2, tokenTexts: ['ecg', 'none'] },
  ];

  const paths = [
    'cardiologica.prima visita',
    'cardiologica.prima visita.ecg',
  ];

  it('includes none in options and marks optional_include style', () => {
    const corpus = buildCorpusItemsFromPaths(paths, categories);
    const ecgItem: BundleCorpusItem = {
      ...corpus[1]!,
      path: 'cardiologica.prima visita.ecg',
      segments: [
        ...corpus[1]!.segments.filter((s) => s.categoryName !== 'ECG'),
        { text: 'ecg', categoryName: 'ECG', categoryType: 'attributo' },
      ],
    };
    const plainItem: BundleCorpusItem = {
      path: 'cardiologica.prima visita',
      sourceText: 'cardiologica.prima visita',
      confirmationText: 'cardiologica.prima visita',
      segments: corpus[0]!.segments.filter((s) => s.categoryName !== 'ECG'),
      unmatched: [],
      constraints: [],
    };

    const result = compileDisambiguationPlan({
      itemPaths: paths,
      categories,
      corpusItems: [plainItem, ecgItem],
    });

    const ecgNode = result.nodes.find(
      (n) => n.action === 'disambiguate' && n.categoryName === 'ECG',
    );
    expect(ecgNode).toBeDefined();
    expect(ecgNode!.options).toContain('none');
    expect(ecgNode!.options).toContain('ecg');
    expect(ecgNode!.style).toBe('optional_include');
  });
});

describe('compileDisambiguationPlan — age expansion', () => {
  it('explores past ask_age when items have age constraints', () => {
    const categories: TokenCategory[] = [
      { id: 'c1', name: 'specialità', order: 0, tokenTexts: ['cardiologica'] },
      { id: 'c2', name: 'tipo visita', order: 1, tokenTexts: ['prima visita', 'controllo'] },
    ];
    const paths = [
      'cardiologica.prima visita',
      'cardiologica.controllo',
    ];
    const corpus = buildCorpusItemsFromPaths(paths, categories).map((item) => ({
      ...item,
      constraints: [{
        kind: 'age_years' as const,
        categoryName: 'fascia di età',
        askKey: 'age_years' as const,
        min: 18,
        max: null,
        minMonths: 216,
        maxMonths: null,
        minWeeks: 936,
        maxWeeks: null,
        sourceToken: 'adulti',
      }],
    }));

    const result = compileDisambiguationPlan({
      itemPaths: paths,
      categories,
      corpusItems: corpus,
    });

    expect(result.stats.totalStates).toBeGreaterThan(1);
    expect(result.stats.uniqueAgePatterns).toBe(1);
    expect(result.stats.disambiguateNodes).toBeGreaterThan(0);
  });
});

describe('buildGuidedPathToTarget', () => {
  it('walks to a cardio leaf with minimal token picks', () => {
    const corpus = buildCorpusItemsWithConstraints(cardioPaths, baseCategories);
    const target = 'cardiologica.prima visita.adulti';
    const result = buildGuidedPathToTarget(corpus, baseCategories, target);

    expect(result.reachable).toBe(true);
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.steps.every((s) => s.userText.trim().length > 0)).toBe(true);
  });

  it('reports unreachable for unknown path', () => {
    const corpus = buildCorpusItemsWithConstraints(cardioPaths, baseCategories);
    const result = buildGuidedPathToTarget(corpus, baseCategories, 'missing.path.here');
    expect(result.reachable).toBe(false);
    expect(result.reason).toMatch(/non trovato/i);
  });
});

describe('compileDisambiguationPlan — runtime-aligned exam age filter', () => {
  const examCategories: TokenCategory[] = [
    { id: 'c0', name: 'tipo prestazione', order: 0, tokenTexts: ['esame'] },
    { id: 'c1', name: 'specialità', order: 1, tokenTexts: ['pediatrico'] },
    {
      id: 'c2',
      name: 'fascia di età',
      order: 2,
      type: 'vincolo',
      tokenTexts: ['over 17 anni', 'da over 1 anno under 16 anni'],
      valueKind: 'age_years',
    },
    { id: 'c3', name: 'esame', order: 3, tokenTexts: ['ecg'] },
  ];

  const examPaths = [
    'esame.over 17 anni.ecg',
    'esame.pediatrico.ecg.da over 1 anno under 16 anni',
  ];

  it('does not ask specialità pediatrico after adult age (matches runtime filter)', () => {
    const corpusItems = buildCorpusItemsWithConstraints(examPaths, examCategories);
    const result = compileDisambiguationPlan({
      itemPaths: examPaths,
      categories: examCategories,
      corpusItems,
    });

    const pediatricAfterAdult = result.nodes.find(
      (n) => n.action === 'disambiguate'
        && n.categoryName === 'specialità'
        && n.signature.includes('pediatrico')
        && n.ageYears === 30,
    );
    expect(pediatricAfterAdult).toBeUndefined();
    expect(result.nodes.some((n) => n.action === 'ask_age')).toBe(true);
  });

  it('seeds bootstrap from first path segment (tipo prestazione=esame)', () => {
    const corpusItems = buildCorpusItemsWithConstraints(examPaths, examCategories);
    const result = compileDisambiguationPlan({
      itemPaths: examPaths,
      categories: examCategories,
      corpusItems,
    });
    expect(result.warnings.some((w) => w.includes('bootstrap'))).toBe(false);
    expect(result.stats.totalStates).toBeGreaterThan(0);
  });

  it('predicts esame subtype disambiguation after bootstrap esame and adult age', () => {
    const subtypeCategories: TokenCategory[] = [
      { id: 'c0', name: 'tipo prestazione', order: 0, tokenTexts: ['esame'] },
      {
        id: 'c1',
        name: 'fascia di età',
        order: 1,
        type: 'vincolo',
        tokenTexts: ['over 17 anni', '> 17 anni'],
        valueKind: 'age_years',
      },
      { id: 'c2', name: 'esame', order: 2, tokenTexts: ['ecg', 'ecodoppler', 'ecocolordoppler'] },
    ];
    const subtypePaths = [
      'esame.over 17 anni.ecg',
      'esame.over 17 anni.ecodoppler',
      'esame.> 17 anni.ecocolordoppler',
    ];
    const corpusItems = buildCorpusItemsWithConstraints(subtypePaths, subtypeCategories);
    const result = compileDisambiguationPlan({
      itemPaths: subtypePaths,
      categories: subtypeCategories,
      corpusItems,
    });

    const esameAfterAdult = result.nodes.find(
      (n) => n.action === 'disambiguate'
        && n.categoryName === 'esame'
        && n.ageYears != null
        && n.ageYears >= 18
        && n.options.includes('ecg')
        && n.options.includes('ecodoppler'),
    );
    expect(esameAfterAdult).toBeDefined();
    expect(esameAfterAdult!.style).toBe('choice');
    expect(esameAfterAdult!.signature).toBe('esame||ecg|ecocolordoppler|ecodoppler||choice');
  });

  it('predicts esame disambiguation even when one category spans bootstrap and subtype tokens', () => {
    const collisionCategories: TokenCategory[] = [
      { id: 'c0', name: 'esame', order: 0, tokenTexts: ['esame', 'ecg', 'ecodoppler', 'ecocolordoppler'] },
      {
        id: 'c1',
        name: 'fascia di età',
        order: 1,
        type: 'vincolo',
        tokenTexts: ['over 17 anni', '> 17 anni'],
        valueKind: 'age_years',
      },
    ];
    const subtypePaths = [
      'esame.over 17 anni.ecg',
      'esame.over 17 anni.ecodoppler',
      'esame.> 17 anni.ecocolordoppler',
    ];
    const corpusItems = buildCorpusItemsWithConstraints(subtypePaths, collisionCategories);
    const result = compileDisambiguationPlan({
      itemPaths: subtypePaths,
      categories: collisionCategories,
      corpusItems,
    });

    const esameNode = result.nodes.find(
      (n) => n.action === 'disambiguate' && n.categoryName === 'esame' && n.ageYears != null,
    );
    expect(esameNode).toBeDefined();
  });
});

describe('compileDisambiguationPlan — validation', () => {
  it('throws when catalog is empty', () => {
    expect(() => compileDisambiguationPlan({ itemPaths: [], categories: baseCategories }))
      .toThrow(/prestazione/i);
  });
});
