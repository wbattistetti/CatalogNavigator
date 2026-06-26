/**
 * Tests for Italian age utterance normalization (STT / voice variants).
 */
import { describe, expect, it } from 'vitest';
import {
  expandTruncatedAgeStem,
  normalizeAgeUtterance,
} from './ageUtteranceNormalize';
import {
  compileAgeVincoloResolutionPipeline,
  runResolutionPipelineForTest,
} from './vincoloResolutionPipeline';

describe('expandTruncatedAgeStem', () => {
  it('expands colloquial tens stems', () => {
    expect(expandTruncatedAgeStem('trent')).toBe('trenta');
    expect(expandTruncatedAgeStem('vent')).toBe('venti');
    expect(expandTruncatedAgeStem('quarant')).toBe('quaranta');
  });

  it('leaves full words unchanged', () => {
    expect(expandTruncatedAgeStem('trenta')).toBe('trenta');
    expect(expandTruncatedAgeStem('due')).toBe('due');
  });
});

describe('normalizeAgeUtterance', () => {
  it('expands vent\'anni and trent\'anni', () => {
    expect(normalizeAgeUtterance("ha vent'anni")).toBe('ha venti anni');
    expect(normalizeAgeUtterance("trent'anni")).toBe('trenta anni');
    expect(normalizeAgeUtterance("Trent'anni.")).toBe('trenta anni');
  });

  it('expands unicode apostrophe from STT', () => {
    expect(normalizeAgeUtterance('trent\u2019anni')).toBe('trenta anni');
  });

  it('preserves numeric and word units', () => {
    expect(normalizeAgeUtterance('2 giorni')).toBe('2 giorni');
    expect(normalizeAgeUtterance('3 mesi')).toBe('3 mesi');
    expect(normalizeAgeUtterance('5 settimane')).toBe('5 settimane');
    expect(normalizeAgeUtterance('due giorni')).toBe('due giorni');
    expect(normalizeAgeUtterance('tre mesi')).toBe('tre mesi');
  });
});

describe('pipeline after normalization', () => {
  const pipeline = compileAgeVincoloResolutionPipeline();

  it('resolves trent\'anni as 30 years', () => {
    expect(runResolutionPipelineForTest(pipeline, "trent'anni")).toEqual({
      value: 30,
      unit: 'years',
    });
  });

  it('resolves neonate-style ages', () => {
    expect(runResolutionPipelineForTest(pipeline, '2 giorni')).toEqual({
      value: 2,
      unit: 'days',
    });
    expect(runResolutionPipelineForTest(pipeline, '3 mesi')).toEqual({
      value: 3,
      unit: 'months',
    });
    expect(runResolutionPipelineForTest(pipeline, '5 settimane')).toEqual({
      value: 5,
      unit: 'weeks',
    });
    expect(runResolutionPipelineForTest(pipeline, 'due giorni')).toEqual({
      value: 2,
      unit: 'days',
    });
  });
});
