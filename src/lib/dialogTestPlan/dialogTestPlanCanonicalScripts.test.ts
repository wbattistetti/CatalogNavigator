/**
 * Tests for static canonical dialog test scripts.
 */
import { describe, expect, it } from 'vitest';
import type { BundleCorpusItem } from '../agentBundleTypes';
import {
  buildCanonicalDialogScripts,
  buildCanonicalSegmentTexts,
  mergeOpeningTokensWithGuidedSteps,
  pickValidAgeYears,
} from './dialogTestPlanCanonicalScripts';

const categories = [
  { id: 'c1', name: 'specialità', order: 0, tokenTexts: ['ecodoppler'] },
  { id: 'c2', name: 'distretto', order: 1, tokenTexts: ['aorta', 'venoso'] },
  { id: 'c3', name: 'fascia età', order: 2, tokenTexts: ['adulti'] },
];

const item: BundleCorpusItem = {
  path: 'ecodoppler.aorta.venoso',
  sourceText: 'ECODOPPLER AORTA VENOSO',
  confirmationText: 'ECODOPPLER AORTA VENOSO',
  segments: [
    { text: 'venoso', categoryName: 'distretto', categoryType: 'attributo' },
    { text: 'ecodoppler', categoryName: 'specialità', categoryType: 'attributo' },
    { text: 'aorta', categoryName: 'distretto', categoryType: 'attributo' },
    { text: 'none', categoryName: 'ECG', categoryType: 'attributo' },
  ],
  unmatched: [],
  constraints: [{
    kind: 'age_years',
    categoryName: 'fascia età',
    askKey: 'age_years',
    min: 18,
    max: null,
    minMonths: 216,
    maxMonths: null,
    minWeeks: 936,
    maxWeeks: null,
    sourceToken: 'adulti',
  }],
};

describe('buildCanonicalSegmentTexts', () => {
  it('orders attributo segments by category.order and excludes none', () => {
    expect(buildCanonicalSegmentTexts(item, categories)).toEqual([
      'ecodoppler',
      'aorta',
      'venoso',
      '18 anni',
    ]);
  });
});

describe('pickValidAgeYears', () => {
  it('returns age within constraints', () => {
    expect(pickValidAgeYears(item.constraints)).toBe(18);
  });
});

describe('mergeOpeningTokensWithGuidedSteps', () => {
  it('prepends catalog tokens absent from guided engine steps', () => {
    expect(mergeOpeningTokensWithGuidedSteps(
      ['16 anni', 'prima'],
      ['ginecologica', 'prima', '16 anni'],
    )).toEqual(['ginecologica', '16 anni', 'prima']);
  });
});

describe('buildCanonicalDialogScripts', () => {
  it('minimal sends one catalog token per turn without natural opening', () => {
    const tokens = buildCanonicalSegmentTexts(item, categories);
    const scripts = buildCanonicalDialogScripts(item.sourceText, tokens);
    expect(scripts.minimal.userSteps).toEqual([
      'ecodoppler',
      'aorta',
      'venoso',
      '18 anni',
    ]);
    expect(scripts.minimal.userSteps[0]).not.toMatch(/^Vorrei prenotare/i);
  });

  it('complete joins opening and tokens in one message', () => {
    const tokens = buildCanonicalSegmentTexts(item, categories);
    const scripts = buildCanonicalDialogScripts(item.sourceText, tokens);
    expect(scripts.complete.userSteps).toHaveLength(1);
    expect(scripts.complete.userSteps[0]).toContain('Vorrei prenotare');
    expect(scripts.complete.userSteps[0]).toContain('ecodoppler');
  });
});
