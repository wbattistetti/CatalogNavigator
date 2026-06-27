import { describe, expect, it } from 'vitest';
import { addSynonymToDisambiguationAnswerGrammar } from './addSynonymToDisambiguationGrammar';

describe('addSynonymToDisambiguationAnswerGrammar', () => {
  const options = ['none', 'step test', 'test da sforzo massimale'];

  it('adds synonym to target option panel', () => {
    const result = addSynonymToDisambiguationAnswerGrammar({
      options,
      style: 'choice',
      grammar: null,
      targetOption: 'test da sforzo massimale',
      synonym: 'test da sforzo',
    });
    expect(result.added).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.grammar.regex).toContain('test da sforzo');
  });

  it('is idempotent when synonym already present', () => {
    const first = addSynonymToDisambiguationAnswerGrammar({
      options,
      style: 'choice',
      grammar: null,
      targetOption: 'test da sforzo massimale',
      synonym: 'test da sforzo',
    });
    const second = addSynonymToDisambiguationAnswerGrammar({
      options,
      style: 'choice',
      grammar: first.grammar,
      targetOption: 'test da sforzo massimale',
      synonym: 'test da sforzo',
    });
    expect(second.added).toBe(false);
    expect(second.error).toBeUndefined();
  });
});
