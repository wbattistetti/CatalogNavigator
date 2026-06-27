/**
 * Tests for disambiguation answer grammar draft matching.
 */
import { describe, expect, it } from 'vitest';
import {
  buildDisambiguationAnswerGrammarPanels,
  compileDisambiguationAnswerGrammarFromPanels,
  evaluateDisambiguationTestPhrase,
  matchDisambiguationAnswerDraft,
  matchAllDisambiguationAnswerDraft,
} from './disambiguationAnswerGrammarEditor';
import { extractSynonymsForTarget } from './grammarSynonyms';

describe('matchDisambiguationAnswerDraft', () => {
  it('matches affirmative against optional_include draft', () => {
    const panels = buildDisambiguationAnswerGrammarPanels(
      ['ecg', 'none'],
      null,
      'optional_include',
    );
    const result = matchDisambiguationAnswerDraft(panels, 'sì', ['ecg', 'none'], 'optional_include');
    expect(result.selectedOption).toBe('ecg');
    expect(result.compileError).toBeNull();
  });

  it('returns null option for empty utterance', () => {
    const panels = buildDisambiguationAnswerGrammarPanels(
      ['ecg', 'none'],
      null,
      'optional_include',
    );
    expect(
      matchDisambiguationAnswerDraft(panels, '   ', ['ecg', 'none'], 'optional_include').selectedOption,
    ).toBeNull();
  });

  it('persists synonym deletion through compile and extract roundtrip', () => {
    const option = 'test da sforzo massimale';
    const panels = buildDisambiguationAnswerGrammarPanels([option, 'none'], null, 'optional_include');
    const targetPanel = panels.find((panel) => panel.targetPath === option);
    expect(targetPanel).toBeDefined();

    const withoutAnche = panels.map((panel) => (
      panel.targetPath === option
        ? { ...panel, synonyms: panel.synonyms.filter((s) => s.toLowerCase() !== 'anche') }
        : panel
    ));

    const compiled = compileDisambiguationAnswerGrammarFromPanels(
      withoutAnche,
      [option, 'none'],
      'optional_include',
    );
    const extracted = extractSynonymsForTarget(compiled, option);

    expect(extracted.map((s) => s.toLowerCase())).not.toContain('anche');
    expect(extracted.length).toBeGreaterThan(0);
  });

  it('evaluates ok when phrase matches expected option', () => {
    const panels = buildDisambiguationAnswerGrammarPanels(['ecg', 'none'], null, 'optional_include');
    const result = evaluateDisambiguationTestPhrase(panels, 'sì', 'ecg', ['ecg', 'none'], 'optional_include');
    expect(result.status).toBe('ok');
    expect(result.recognized).toBe('ecg');
  });

  it('evaluates mismatch when another option is recognized', () => {
    const panels = buildDisambiguationAnswerGrammarPanels(['ecg', 'none'], null, 'optional_include');
    const result = evaluateDisambiguationTestPhrase(panels, 'no', 'ecg', ['ecg', 'none'], 'optional_include');
    expect(result.status).toBe('mismatch');
    expect(result.recognized).toBe('none');
  });

  it('resolves combinatorial atoms to catalog option key', () => {
    const options = ['ECG+Ecodoppler', 'Holter'];
    const panels = buildDisambiguationAnswerGrammarPanels(options, null, 'choice');
    expect(panels.map((p) => p.targetPath).sort()).toEqual(['ECG', 'Ecodoppler', 'Holter']);

    const withSynonyms = panels.map((panel) => (
      panel.targetPath === 'ECG'
        ? { ...panel, synonyms: ['ecg', 'elettrocardiogramma'] }
        : panel
    ));
    const result = matchAllDisambiguationAnswerDraft(
      withSynonyms,
      'ecg e ecodoppler',
      options,
      'choice',
    );
    expect(result.selectedOption).toBe('ECG+Ecodoppler');
    expect(result.matchedAtoms).toEqual(expect.arrayContaining(['ECG', 'Ecodoppler']));
  });
});
