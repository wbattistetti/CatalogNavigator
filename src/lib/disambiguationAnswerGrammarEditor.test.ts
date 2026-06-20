/**
 * Tests for disambiguation answer grammar draft matching.
 */
import { describe, expect, it } from 'vitest';
import {
  buildDisambiguationAnswerGrammarPanels,
  matchDisambiguationAnswerDraft,
} from './disambiguationAnswerGrammarEditor';

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
});
