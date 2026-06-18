/**
 * Tests for compileDisambiguationPlan — reachable graph and stats.
 */
import { describe, expect, it } from 'vitest';
import type { TokenCategory } from './dictionaryTree';
import type { BundleCorpusItem } from './agentBundleTypes';
import {
  buildDisambiguationSignature,
  compileDisambiguationPlan,
  inferQuestionStyle,
} from './compileDisambiguationPlan';
import { buildCorpusItemsFromPaths } from './slotExtract';

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

describe('compileDisambiguationPlan — cardio fixture', () => {
  it('computes reachable disambiguation nodes from catalog', () => {
    const result = compileDisambiguationPlan({
      itemPaths: cardioPaths,
      categories: baseCategories,
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
    const result = compileDisambiguationPlan({
      itemPaths: cardioPaths,
      categories: baseCategories,
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

describe('compileDisambiguationPlan — validation', () => {
  it('throws when catalog is empty', () => {
    expect(() => compileDisambiguationPlan({ itemPaths: [], categories: baseCategories }))
      .toThrow(/prestazione/i);
  });
});
