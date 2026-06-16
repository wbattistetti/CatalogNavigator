/**
 * Tests for Convai export builders.
 */
import { describe, expect, it } from 'vitest';
import {
  buildConvaiCorpusSegments,
  buildConvaiDictionaryExport,
  buildConvaiFullExport,
  buildConvaiOntologyExport,
  compileConvaiSystemPrompt,
  resolveConvaiPromptHint,
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
    expect(out.categories[0]?.type).toBe('attributo');
    const tac = out.tokens.find((t) => t.canonical === 'tac');
    expect(tac?.aliases).toEqual(['tomografia']);
    expect(tac?.category_type).toBe('attributo');
  });

  it('exports vincolo category type on categories and tokens', () => {
    const dictWithVincolo: TokenDictionary = {
      ...dictionary,
      categories: [
        { id: 'c1', name: 'tipo', order: 0, tokenTexts: ['tac'], type: 'attributo' },
        { id: 'c2', name: 'Vincoli età', order: 1, tokenTexts: ['dai 14 ai 17 anni'], type: 'vincolo' },
      ],
      tokens: [
        { text: 'tac', enabled: true },
        { text: 'dai 14 ai 17 anni', enabled: true },
      ],
    };
    const out = buildConvaiDictionaryExport({ ...baseInput, dictionary: dictWithVincolo });
    expect(out.categories.find((c) => c.name === 'Vincoli età')?.type).toBe('vincolo');
    const ageToken = out.tokens.find((t) => t.canonical === 'dai 14 ai 17 anni');
    expect(ageToken?.category_type).toBe('vincolo');
  });
});

describe('buildConvaiCorpusSegments', () => {
  it('tags each segment with category type', () => {
    const categories = [
      { id: 'c1', name: 'tipo', order: 0, tokenTexts: ['tac'], type: 'attributo' as const },
      { id: 'c2', name: 'età', order: 1, tokenTexts: ['dai 14 ai 17 anni'], type: 'vincolo' as const },
    ];
    expect(buildConvaiCorpusSegments(['tac', 'dai 14 ai 17 anni'], categories)).toEqual([
      { text: 'tac', category_type: 'attributo' },
      { text: 'dai 14 ai 17 anni', category_type: 'vincolo' },
    ]);
  });
});

describe('resolveConvaiPromptHint', () => {
  it('prefers saved question over algorithmic fallback', () => {
    const slots = analysis.rows.map((r) => r.slot_filling);
    const row = analysis.rows.find((r) => r.slot_filling === 'tac.ginocchio');
    const hint = resolveConvaiPromptHint(
      'tac.ginocchio',
      { ...row!, question: 'Destro o sinistro?' },
      slots,
      analysis.item_paths,
    );
    expect(hint).toBe('Destro o sinistro?');
  });
});

describe('buildConvaiOntologyExport', () => {
  it('exports category-ordered typed corpus segments', () => {
    const out = buildConvaiOntologyExport(baseInput);
    const destro = out.corpus_items.find((c) => c.path === 'tac.ginocchio.destro');
    expect(destro?.segments).toEqual([
      { text: 'tac', category_type: 'attributo' },
      { text: 'ginocchio', category_type: 'attributo' },
      { text: 'destro', category_type: 'attributo' },
    ]);
  });

  it('exports slim sibling node with prompt_hint only', () => {
    const out = buildConvaiOntologyExport(baseInput);
    const node = out.interactive_nodes.find((n) => n.slot === 'tac.ginocchio');
    expect(node?.type).toBe('sibling_choice');
    expect(node?.prompt_hint).toContain('destro');
    expect(node?.children).toEqual(['tac.ginocchio.destro', 'tac.ginocchio.sinistro']);
    expect(node).not.toHaveProperty('question');
    expect(node).not.toHaveProperty('no_match_1');
    expect(node).not.toHaveProperty('no_match_2');
    expect(node).not.toHaveProperty('no_match_3');
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
    expect(text).toContain('TIPI DI CATEGORIA');
    expect(text).toContain('VINCOLI (segmenti con category_type = vincolo)');
    expect(text).toContain('RICHIESTE GENERICHE');
    expect(text).toContain('FORMULAZIONE VOCALE');
    expect(text).toContain('TRACCIA DEBUG');
    expect(text).toContain('---PARSED---');
    expect(text).toContain('PROSSIMA_AZIONE:');
    expect(text).toContain('Vietato nel PARSED');
    expect(text).toContain('prompt_hint');
    expect(text).not.toContain('no_match_1');
    expect(text).toContain('Come posso aiutarla?');
    expect(text).toContain('Confermo:');
  });

  it('lists vincolo categories in domain hints', () => {
    const text = compileConvaiSystemPrompt({
      documentName: 'Esami',
      startQuestion: null,
      confirmationPreamble: null,
      categories: [
        { order: 0, name: 'tipo', type: 'attributo', tokens: ['tac'] },
        { order: 1, name: 'Vincoli età', type: 'vincolo', tokens: ['dai 14 ai 17 anni'] },
      ],
    });
    expect(text).toContain('VINCOLI NEL DOMINIO');
    expect(text).toContain('"Vincoli età"');
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
