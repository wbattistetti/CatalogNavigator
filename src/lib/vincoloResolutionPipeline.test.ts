/**
 * Tests for vincolo resolution pipeline generation and TS test runner.
 */
import { describe, expect, it } from 'vitest';
import {
  buildItalianAgeWordLexicon,
  compileAgeVincoloResolutionPipeline,
  compileVincoloResolutionPipeline,
  normalizeAgeUtterance,
  runResolutionPipelineForTest,
  validateResolutionPipeline,
} from './vincoloResolutionPipeline';
import type { TokenCategory } from './dictionaryTree';

describe('buildItalianAgeWordLexicon', () => {
  it('includes compound numbers', () => {
    const lexicon = buildItalianAgeWordLexicon();
    expect(lexicon.ventuno).toBe(21);
    expect(lexicon.trentacinque).toBe(35);
    expect(lexicon.ventitré).toBe(23);
  });
});

describe('normalizeAgeUtterance', () => {
  it('expands vent\'anni', () => {
    expect(normalizeAgeUtterance("mio figlio ha vent'anni")).toBe('mio figlio ha venti anni');
  });
});

describe('compileAgeVincoloResolutionPipeline', () => {
  it('builds valid pipeline v1 with word_unit_capture', () => {
    const pipeline = compileAgeVincoloResolutionPipeline();
    expect(pipeline.engine).toBe('pipeline');
    expect(pipeline.version).toBe(1);
    expect(pipeline.steps.some((s) => s.type === 'word_unit_capture')).toBe(true);
    expect(validateResolutionPipeline(pipeline)).toBeNull();
  });

  it('resolves venti anni', () => {
    const pipeline = compileAgeVincoloResolutionPipeline();
    expect(runResolutionPipelineForTest(pipeline, 'mio figlio ha venti anni')).toEqual({
      value: 20,
      unit: 'years',
    });
  });

  it('resolves vent\'anni', () => {
    const pipeline = compileAgeVincoloResolutionPipeline();
    expect(runResolutionPipelineForTest(pipeline, "ha vent'anni")).toEqual({
      value: 20,
      unit: 'years',
    });
  });

  it('resolves bare number', () => {
    const pipeline = compileAgeVincoloResolutionPipeline();
    expect(runResolutionPipelineForTest(pipeline, '20')).toEqual({ value: 20, unit: 'years' });
  });

  it('resolves numeric months', () => {
    const pipeline = compileAgeVincoloResolutionPipeline();
    expect(runResolutionPipelineForTest(pipeline, '12 mesi')).toEqual({ value: 12, unit: 'months' });
  });

  it('resolves word months (dodici mesi)', () => {
    const pipeline = compileAgeVincoloResolutionPipeline();
    expect(runResolutionPipelineForTest(pipeline, 'dodici mesi')).toEqual({ value: 12, unit: 'months' });
  });

  it('word_unit_capture alternation uses word boundaries', () => {
    const pipeline = compileAgeVincoloResolutionPipeline();
    const step = pipeline.steps.find((s) => s.type === 'word_unit_capture');
    expect(step?.pattern).toMatch(/\\bventitré\\b/);
    expect(step?.pattern).toMatch(/\\bventi\\b/);
  });

  it('resolves ventitré as 23 not 20', () => {
    const pipeline = compileAgeVincoloResolutionPipeline();
    expect(runResolutionPipelineForTest(pipeline, 'ventitré anni')).toEqual({
      value: 23,
      unit: 'years',
    });
  });

  it('resolves compound years (trentacinque anni)', () => {
    const pipeline = compileAgeVincoloResolutionPipeline();
    expect(runResolutionPipelineForTest(pipeline, 'trentacinque anni')).toEqual({
      value: 35,
      unit: 'years',
    });
  });

  it('does not treat article "una" in booking phrase as age', () => {
    const pipeline = compileAgeVincoloResolutionPipeline();
    expect(
      runResolutionPipelineForTest(
        pipeline,
        'vorrei prenotare una prima visita angiologica con ecodoppler',
      ),
    ).toBeNull();
  });

  it('resolves un anno with explicit unit', () => {
    const pipeline = compileAgeVincoloResolutionPipeline();
    expect(runResolutionPipelineForTest(pipeline, 'il bambino ha un anno')).toEqual({
      value: 1,
      unit: 'years',
    });
  });
});

describe('compileVincoloResolutionPipeline', () => {
  const ageCategory: TokenCategory = {
    id: 'v1',
    name: 'fascia di età',
    order: 0,
    tokenTexts: ['> 17 anni'],
    type: 'vincolo',
  };

  it('returns pipeline for age vincolo', () => {
    expect(compileVincoloResolutionPipeline(ageCategory)?.valueKind).toBe('age_years');
  });

  it('returns null for attributo', () => {
    expect(
      compileVincoloResolutionPipeline({ ...ageCategory, type: 'attributo', name: 'specialità' }),
    ).toBeNull();
  });
});
