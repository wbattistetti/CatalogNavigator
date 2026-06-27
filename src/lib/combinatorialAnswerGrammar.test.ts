/**
 * Tests for combinatorial disambiguation answer grammars.
 */
import { describe, expect, it } from 'vitest';
import {
  buildCombinatorialAnswerGrammarPanels,
  compileCombinatorialAnswerGrammar,
  compileCombinatorialAnswerGrammarFromPanels,
  extractAtomicTokensFromOptions,
  matchAllCombinatorialAtoms,
  resolveOptionKeyFromMatchedAtoms,
  shouldUseCombinatorialAnswerGrammar,
} from './combinatorialAnswerGrammar';

const COMBINED_OPTIONS = [
  'ECG+Ecodoppler',
  'ECG+Holter',
  'Holter',
];

describe('shouldUseCombinatorialAnswerGrammar', () => {
  it('activates for multi-value-set options with multiple atoms', () => {
    expect(shouldUseCombinatorialAnswerGrammar(COMBINED_OPTIONS, 'choice')).toBe(true);
  });

  it('skips optional_include and single-value options', () => {
    expect(shouldUseCombinatorialAnswerGrammar(['ecg', 'none'], 'optional_include')).toBe(false);
    expect(shouldUseCombinatorialAnswerGrammar(['adulto', 'pediatrica'], 'choice')).toBe(false);
  });
});

describe('extractAtomicTokensFromOptions', () => {
  it('returns distinct atoms sorted longest first', () => {
    expect(extractAtomicTokensFromOptions(COMBINED_OPTIONS)).toEqual([
      'Ecodoppler',
      'Holter',
      'ECG',
    ]);
  });
});

describe('combinatorial matching', () => {
  const grammar = compileCombinatorialAnswerGrammar(COMBINED_OPTIONS)!;

  it('auto-compiles combinatorial grammar with flag', () => {
    expect(grammar.combinatorial).toBe(true);
    expect(Object.values(grammar.mappings).sort()).toEqual(['ECG', 'Ecodoppler', 'Holter']);
  });

  it('matches multiple atoms in one utterance', () => {
    const panels = buildCombinatorialAnswerGrammarPanels(COMBINED_OPTIONS, grammar);
    const ecgPanel = panels.find((p) => p.targetPath === 'ECG')!;
    const dopplerPanel = panels.find((p) => p.targetPath === 'Ecodoppler')!;
    const compiled = compileCombinatorialAnswerGrammarFromPanels([
      { ...ecgPanel, synonyms: ['ecg', 'elettrocardiogramma'] },
      { ...dopplerPanel, synonyms: ['ecodoppler', 'doppler', 'eco doppler'] },
      panels.find((p) => p.targetPath === 'Holter')!,
    ]);

    const atoms = matchAllCombinatorialAtoms('vorrei ecg e doppler', compiled);
    expect(atoms).toContain('ECG');
    expect(atoms).toContain('Ecodoppler');
    expect(atoms).not.toContain('Holter');
  });

  it('resolves exact catalog option key from matched atoms', () => {
    const mentioned = ['ECG', 'Ecodoppler'];
    expect(resolveOptionKeyFromMatchedAtoms(mentioned, COMBINED_OPTIONS)).toBe('ECG+Ecodoppler');
  });

  it('falls back to maximal compatible option when subset is incomplete in catalog', () => {
    expect(resolveOptionKeyFromMatchedAtoms(['ECG'], COMBINED_OPTIONS)).toBe('ECG+Ecodoppler');
  });
});
