/**
 * Tests for slotExtract — text→slot extraction and slot-based navigation.
 * Also verifies the testEngine slot-mode fixes the "repeat start question" bug.
 */
import { describe, expect, it } from 'vitest';
import type { TokenCategory } from './dictionaryTree';
import type { TokenEntry } from './tokenDictionary';
import { compileSimpleGrammar } from './grammarSynonyms';
import {
  buildCorpusItemsFromPaths,
  matchTextToSlots,
  resolveNextSlotNavigation,
  scorePathsBySlots,
} from './slotExtract';
import { initTest, processInput, type AgentTestConfig } from './testEngine';
import type { AnalysisRow } from './analysisTypes';

// ── Shared fixtures ──────────────────────────────────────────────────────────

const categories: TokenCategory[] = [
  { id: 'c1', name: 'specialità', order: 0, tokenTexts: ['cardiologica', 'allergologica'] },
  { id: 'c2', name: 'tipo visita', order: 1, tokenTexts: ['prima visita', 'controllo'] },
  { id: 'c3', name: 'fascia età', order: 2, tokenTexts: ['adulti', 'pediatrica'], type: 'attributo' },
];

function makeToken(text: string, synonyms?: string[]): TokenEntry {
  return {
    text,
    enabled: true,
    grammar: compileSimpleGrammar(text, synonyms ?? [text]),
  };
}

const tokens: TokenEntry[] = [
  makeToken('cardiologica', ['cardiologica', 'visita cardiologica', 'cardiologico']),
  makeToken('allergologica', ['allergologica', 'visita allergologica']),
  makeToken('prima visita', ['prima visita', 'prima']),
  makeToken('controllo', ['controllo', 'visita di controllo']),
  makeToken('adulti', ['adulti', 'adulto']),
  makeToken('pediatrica', ['pediatrica', 'bambini', 'pediatrico']),
];

const itemPaths = [
  'cardiologica.prima visita.adulti',
  'cardiologica.prima visita.pediatrica',
  'cardiologica.controllo.adulti',
  'cardiologica.controllo.pediatrica',
  'allergologica.prima visita.adulti',
];

// ── matchTextToSlots ─────────────────────────────────────────────────────────

describe('matchTextToSlots', () => {
  it('extracts specialità from "visita cardiologica"', () => {
    const slots = matchTextToSlots('visita cardiologica', tokens, categories);
    expect(slots['specialita']).toBe('cardiologica');
  });

  it('extracts multiple slots from a rich utterance', () => {
    const slots = matchTextToSlots('una prima visita cardiologica per adulti', tokens, categories);
    expect(slots['specialita']).toBe('cardiologica');
    expect(slots['tipo visita']).toBe('prima visita');
    expect(slots['fascia eta']).toBe('adulti');
  });

  it('returns empty when no token grammar matches', () => {
    const slots = matchTextToSlots('qualcosa di completamente diverso', tokens, categories);
    expect(Object.keys(slots)).toHaveLength(0);
  });
});

// ── buildCorpusItemsFromPaths ────────────────────────────────────────────────

describe('buildCorpusItemsFromPaths', () => {
  it('assigns correct categoryName to each segment', () => {
    const corpus = buildCorpusItemsFromPaths(
      ['cardiologica.prima visita.adulti'],
      categories,
    );
    expect(corpus).toHaveLength(1);
    const segs = corpus[0]!.segments;
    expect(segs[0]).toMatchObject({ text: 'cardiologica', categoryName: 'specialità' });
    expect(segs[1]).toMatchObject({ text: 'prima visita', categoryName: 'tipo visita' });
    expect(segs[2]).toMatchObject({ text: 'adulti', categoryName: 'fascia età' });
  });
});

// ── scorePathsBySlots ────────────────────────────────────────────────────────

describe('scorePathsBySlots', () => {
  it('keeps only paths matching resolved slots', () => {
    const corpus = buildCorpusItemsFromPaths(itemPaths, categories);
    const { paths, maxCount } = scorePathsBySlots(
      itemPaths,
      corpus,
      { specialita: 'cardiologica' },
    );
    expect(maxCount).toBe(1);
    expect(paths.every((p) => p.startsWith('cardiologica'))).toBe(true);
    expect(paths).not.toContain('allergologica.prima visita.adulti');
  });

  it('narrows further with two resolved slots', () => {
    const corpus = buildCorpusItemsFromPaths(itemPaths, categories);
    const { paths } = scorePathsBySlots(
      itemPaths,
      corpus,
      { specialita: 'cardiologica', 'tipo visita': 'prima visita' },
    );
    expect(paths).toEqual([
      'cardiologica.prima visita.adulti',
      'cardiologica.prima visita.pediatrica',
    ]);
  });
});

// ── resolveNextSlotNavigation ────────────────────────────────────────────────

describe('resolveNextSlotNavigation', () => {
  const corpus = buildCorpusItemsFromPaths(itemPaths, categories);

  it('asks tipo visita first when only specialità resolved', () => {
    const candidates = itemPaths.filter((p) => p.startsWith('cardiologica'));
    const nav = resolveNextSlotNavigation(candidates, corpus, { specialita: 'cardiologica' }, categories);
    expect(nav.kind).toBe('disambiguate');
    if (nav.kind === 'disambiguate') {
      expect(nav.categoryName).toBe('tipo visita');
      expect(nav.options).toContain('prima visita');
      expect(nav.options).toContain('controllo');
    }
  });

  it('confirms single candidate', () => {
    const nav = resolveNextSlotNavigation(
      ['cardiologica.prima visita.adulti'],
      corpus,
      { specialita: 'cardiologica', 'tipo visita': 'prima visita', 'fascia eta': 'adulti' },
      categories,
    );
    expect(nav.kind).toBe('confirm');
    if (nav.kind === 'confirm') {
      expect(nav.path).toBe('cardiologica.prima visita.adulti');
    }
  });

  it('returns no_match for empty candidates', () => {
    const nav = resolveNextSlotNavigation([], corpus, {}, categories);
    expect(nav.kind).toBe('no_match');
  });
});

// ── testEngine slot mode ─────────────────────────────────────────────────────

function makeRow(slot_filling: string, overrides: Partial<AnalysisRow> = {}): AnalysisRow {
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
    ...overrides,
  };
}

const rows: AnalysisRow[] = [
  makeRow('cardiologica'),
  makeRow('cardiologica.prima visita'),
  makeRow('cardiologica.prima visita.adulti', { confirmation_text: 'Prima visita cardiologica adulti' }),
  makeRow('cardiologica.prima visita.pediatrica', { confirmation_text: 'Prima visita cardiologica pediatrica' }),
  makeRow('cardiologica.controllo'),
  makeRow('cardiologica.controllo.adulti', { confirmation_text: 'Controllo cardiologico adulti' }),
  makeRow('cardiologica.controllo.pediatrica', { confirmation_text: 'Controllo cardiologico pediatrica' }),
  makeRow('allergologica'),
  makeRow('allergologica.prima visita'),
  makeRow('allergologica.prima visita.adulti', { confirmation_text: 'Prima visita allergologica adulti' }),
];

const config: AgentTestConfig = {
  start_question: 'Buongiorno, quale esame o prestazione desidera prenotare?',
  confirmation_preamble: 'Quindi confermo:',
  item_paths: itemPaths,
  tokens,
  categories,
};

describe('testEngine slot mode', () => {
  it('does NOT repeat start question after "visita cardiologica"', () => {
    const s0 = initTest(rows, config);
    const s1 = processInput(s0, 'visita cardiologica', rows, config);

    const lastAgent = [...s1.messages].reverse().find((m) => m.role === 'agent');
    expect(lastAgent?.text).not.toBe(config.start_question);
    expect(s1.selectedPath).toBeNull(); // not yet done
  });

  it('asks tipo visita after "visita cardiologica"', () => {
    const s0 = initTest(rows, config);
    const s1 = processInput(s0, 'visita cardiologica', rows, config);

    expect(s1.resolvedSlots['specialita']).toBe('cardiologica');
    expect(s1.pendingCategoryKey).toBe('tipo visita');
    const msg = [...s1.messages].reverse().find((m) => m.role === 'agent');
    expect(msg?.text).toMatch(/tipo visita/i);
  });

  it('confirms leaf after full disambiguation', () => {
    const s0 = initTest(rows, config);
    const s1 = processInput(s0, 'visita cardiologica', rows, config);
    const s2 = processInput(s1, 'prima visita', rows, config);
    const s3 = processInput(s2, 'adulti', rows, config);

    expect(s3.selectedPath).toBe('cardiologica.prima visita.adulti');
    const resultMsg = s3.messages.find((m) => m.isResult);
    expect(resultMsg?.text).toMatch(/Prima visita cardiologica adulti/);
  });
});
