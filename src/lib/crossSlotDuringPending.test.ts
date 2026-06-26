/**
 * Tests for cross-slot answers during pending disambiguation.
 */
import { describe, expect, it } from 'vitest';
import type { TokenCategory } from './dictionaryTree';
import type { TokenEntry } from './tokenDictionary';
import { compileSimpleGrammar } from './grammarSynonyms';
import { buildCorpusItemsFromPaths } from './slotExtract';
import { crossSlotSlotsDuringPending } from './crossSlotDuringPending';
import { initTest, processInput, type AgentTestConfig } from './testEngine';
import type { AnalysisRow } from './analysisTypes';

function makeToken(text: string, synonyms?: string[]): TokenEntry {
  return {
    text,
    enabled: true,
    grammar: compileSimpleGrammar(text, synonyms ?? [text]),
  };
}

function makeRow(slot_filling: string): AnalysisRow {
  return {
    slot_filling,
    question: null,
    grammar: null,
    answer_grammar: null,
    no_match_1: null,
    no_match_2: null,
    no_match_3: null,
    confirmation_text: null,
    status: null,
  };
}

describe('crossSlotDuringPending', () => {
  const categories: TokenCategory[] = [
    { id: 'c1', name: 'specialità', order: 0, tokenTexts: ['chirurgica'] },
    { id: 'c2', name: 'sottospecialità', order: 1, tokenTexts: ['generale', 'ortopedica'] },
    { id: 'c3', name: 'tipo visita', order: 2, tokenTexts: ['prima visita', 'controllo'] },
  ];

  const tokens: TokenEntry[] = [
    makeToken('chirurgica', ['chirurgica', 'visita chirurgica']),
    makeToken('generale', ['generale']),
    makeToken('ortopedica', ['ortopedica']),
    makeToken('prima visita', ['prima visita', 'prima']),
    makeToken('controllo', ['controllo', 'di controllo']),
  ];

  const itemPaths = [
    'chirurgica.generale.prima visita',
    'chirurgica.ortopedica.prima visita',
    'chirurgica.generale.controllo',
  ];

  const corpusItems = buildCorpusItemsFromPaths(itemPaths, categories);

  it('accepts tipo visita when sottospecialità is pending', () => {
    const cross = crossSlotSlotsDuringPending(
      'di controllo',
      'sottospecialità',
      { specialita: 'chirurgica' },
      tokens,
      categories,
      itemPaths,
      corpusItems,
    );
    expect(cross).toEqual({ 'tipo visita': 'controllo' });
  });

  it('processInput confirms after cross-slot answer', () => {
    const rows = itemPaths.map(makeRow);
    const config: AgentTestConfig = {
      start_question: 'Come posso aiutarla?',
      confirmation_preamble: 'Confermo:',
      item_paths: itemPaths,
      tokens,
      categories,
    };

    const s0 = initTest(rows, config);
    const s1 = processInput(s0, 'visita chirurgica', rows, config);
    expect(s1.pendingCategoryKey).toBe('sottospecialita');

    const s2 = processInput(s1, 'di controllo', rows, config);
    expect(s2.selectedPath).toBe('chirurgica.generale.controllo');
  });
});
