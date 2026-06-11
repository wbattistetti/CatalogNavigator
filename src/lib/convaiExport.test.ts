/**
 * Tests for Convai export builders.
 */
import { describe, expect, it } from 'vitest';
import {
  buildConvaiDictionaryExport,
  buildConvaiFullExport,
  buildConvaiOntologyExport,
  compileConvaiSystemPrompt,
} from './convaiExport';
import type { Analysis } from './analysisTypes';
import type { TokenDictionary } from './tokenDictionary';

const dictionary: TokenDictionary = {
  descriptionColumn: 'descrizione',
  categories: [
    { id: 'c1', name: 'tipo', order: 0, tokenTexts: ['tac'] },
    { id: 'c2', name: 'distretto', order: 1, tokenTexts: ['ginocchio'] },
    { id: 'c3', name: 'lato', order: 2, tokenTexts: ['destro', 'sinistro'] },
  ],
  tokens: [
    { text: 'tac', enabled: true },
    { text: 'tomografia', enabled: true, aliasOf: 'tac' },
    { text: 'ginocchio', enabled: true },
    { text: 'destro', enabled: true },
    { text: 'sinistro', enabled: true },
  ],
};

const descriptions = [
  'TAC ginocchio destro',
  'TAC ginocchio sinistro',
];

const analysis: Analysis = {
  id: 'a1',
  document_id: 'd1',
  rows: [
    { slot_filling: 'tac', question: null, grammar: null, answer_grammar: null, no_match_1: null, no_match_2: null, no_match_3: null, confirmation_text: null },
    { slot_filling: 'tac.ginocchio', question: null, grammar: null, answer_grammar: null, no_match_1: null, no_match_2: null, no_match_3: null, confirmation_text: null },
    { slot_filling: 'tac.ginocchio.destro', question: null, grammar: null, answer_grammar: null, no_match_1: null, no_match_2: null, no_match_3: null, confirmation_text: 'TAC ginocchio destro' },
    { slot_filling: 'tac.ginocchio.sinistro', question: null, grammar: null, answer_grammar: null, no_match_1: null, no_match_2: null, no_match_3: null, confirmation_text: null },
  ],
  item_paths: ['tac.ginocchio.destro', 'tac.ginocchio.sinistro'],
  start_question: 'Come posso aiutarla?',
  confirmation_preamble: 'Confermo:',
  created_at: '',
  updated_at: '',
};

const baseInput = {
  documentName: 'Esami',
  dictionary,
  descriptions,
  analysis,
};

describe('buildConvaiDictionaryExport', () => {
  it('exports categories and grouped aliases', () => {
    const out = buildConvaiDictionaryExport(baseInput);
    expect(out.categories).toHaveLength(3);
    expect(out.categories[0]?.order).toBe(0);
    const tac = out.tokens.find((t) => t.canonical === 'tac');
    expect(tac?.aliases).toEqual(['tomografia']);
  });
});

describe('buildConvaiOntologyExport', () => {
  it('exports category-ordered corpus segments', () => {
    const out = buildConvaiOntologyExport(baseInput);
    const destro = out.corpus_items.find((c) => c.path === 'tac.ginocchio.destro');
    expect(destro?.segments).toEqual(['tac', 'ginocchio', 'destro']);
  });

  it('exports sibling disambiguation node', () => {
    const out = buildConvaiOntologyExport(baseInput);
    const node = out.interactive_nodes.find((n) => n.slot === 'tac.ginocchio');
    expect(node?.type).toBe('sibling_choice');
    expect(node?.question).toContain('destro');
    expect(node?.children).toEqual(['tac.ginocchio.destro', 'tac.ginocchio.sinistro']);
  });

  it('exports leaf confirmation data', () => {
    const out = buildConvaiOntologyExport(baseInput);
    expect(out.leaf_data['tac.ginocchio.destro']?.confirmation_text).toBe('TAC ginocchio destro');
    expect(out.leaf_data['tac.ginocchio.destro']?.source_text).toBe('TAC ginocchio destro');
  });
});

describe('compileConvaiSystemPrompt', () => {
  it('includes motor rules and start question', () => {
    const text = compileConvaiSystemPrompt({
      documentName: 'Esami',
      startQuestion: 'Come posso aiutarla?',
      confirmationPreamble: 'Confermo:',
    });
    expect(text).toContain('MOTORE DI SELEZIONE');
    expect(text).toContain('Come posso aiutarla?');
    expect(text).toContain('Confermo:');
  });
});

describe('buildConvaiFullExport', () => {
  it('returns all four artifacts', () => {
    const out = buildConvaiFullExport(baseInput);
    expect(out.systemPrompt.length).toBeGreaterThan(100);
    expect(JSON.parse(out.dictionaryJson).tokens.length).toBeGreaterThan(0);
    expect(JSON.parse(out.ontologyJson).corpus_items.length).toBe(2);
    expect(JSON.parse(out.unifiedKbJson).dictionary).toBeDefined();
  });
});
