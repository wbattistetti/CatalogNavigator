/**
 * Tests for disambiguation answer grammar draft matching.
 */
import { describe, expect, it } from 'vitest';
import {
  buildDisambiguationAnswerGrammarPanels,
  compileDisambiguationAnswerGrammarFromPanels,
  matchDisambiguationAnswerDraft,
} from './disambiguationAnswerGrammarEditor';
import { extractSynonymsForTarget } from './grammarSynonyms';

describe('matchDisambiguationAnswerDraft', () => {
  it('matches affirmative against optional_include draft', () => {
    const panels = buildDisambiguationAnswerGrammarPanels(
      ['ecg', 'none'],
      null,
      'optional_include',
    );
    const result = matchDisambiguationAnswerDraft(panels, 'sì');
    expect(result.selectedOption).toBe('ecg');
    expect(result.compileError).toBeNull();
  });

  it('returns null option for empty utterance', () => {
    const panels = buildDisambiguationAnswerGrammarPanels(
      ['ecg', 'none'],
      null,
      'optional_include',
    );
    expect(matchDisambiguationAnswerDraft(panels, '   ').selectedOption).toBeNull();
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

    const compiled = compileDisambiguationAnswerGrammarFromPanels(withoutAnche);
    const extracted = extractSynonymsForTarget(compiled, option);

    expect(extracted.map((s) => s.toLowerCase())).not.toContain('anche');
    expect(extracted.length).toBeGreaterThan(0);
  });
});
