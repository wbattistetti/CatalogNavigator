/**
 * Tests for disambiguation plan storage merge and restore.
 */
import { describe, expect, it } from 'vitest';
import type { DisambiguationEditorRow } from './disambiguationPlanMessages';
import {
  buildPlanResultFromStorage,
  hasSavedDisambiguationContent,
  mergeDisambiguationPlanAfterCompute,
  mergeDisambiguationPlanStorage,
  patchDisambiguationPlanMessage,
  regenerateDisambiguationAnswerGrammars,
  rowsNeedingDisambiguationMessages,
  summarizeDisambiguationMerge,
} from './disambiguationPlanMessages';
import type { DisambiguationPlanStorage } from './disambiguationPlanTypes';

const row: DisambiguationEditorRow = {
  signature: 'tipo visita||controllo|prima visita||choice',
  categoryName: 'tipo visita',
  options: ['controllo', 'prima visita'],
  style: 'choice',
  question: 'Prima visita o controllo?',
  no_match_1: null,
  no_match_2: null,
  no_match_3: null,
  contextCount: 1,
  nodeKeys: ['k1'],
  sampleAcquired: {},
  parentInfo: { parents: [], contextPrefixes: [], scope: 'none', parentCategoryName: null },
  candidatePaths: [],
  contextVariants: [],
};

const emptyRow: DisambiguationEditorRow = {
  ...row,
  signature: 'ECG||ecg||optional_include',
  categoryName: 'ECG',
  options: ['ecg', 'none'],
  style: 'optional_include',
  question: null,
};

describe('hasSavedDisambiguationContent', () => {
  it('returns true when messages have questions', () => {
    expect(hasSavedDisambiguationContent({
      computedAt: null,
      messages: [{ ...row, question: 'Domanda?' }],
    })).toBe(true);
  });

  it('returns false for empty storage', () => {
    expect(hasSavedDisambiguationContent(null)).toBe(false);
    expect(hasSavedDisambiguationContent({ computedAt: null, messages: [] })).toBe(false);
  });
});

describe('mergeDisambiguationPlanStorage', () => {
  it('keeps orphan saved messages not in the new compute (legacy)', () => {
    const previous: DisambiguationPlanStorage = {
      computedAt: '2026-01-01',
      messages: [{
        signature: 'old||sig||choice',
        categoryName: 'old',
        options: ['a'],
        style: 'choice',
        question: 'Vecchia domanda',
        no_match_1: null,
        no_match_2: null,
        no_match_3: null,
      }],
    };
    const merged = mergeDisambiguationPlanStorage([row], '2026-06-18', previous);
    expect(merged.messages).toHaveLength(2);
    expect(merged.messages.some((m) => m.signature === 'old||sig||choice')).toBe(true);
  });
});

describe('mergeDisambiguationPlanAfterCompute', () => {
  it('drops obsolete signatures and keeps only current plan rows', () => {
    const previous: DisambiguationPlanStorage = {
      computedAt: '2026-01-01',
      messages: [{
        signature: 'old||sig||choice',
        categoryName: 'old',
        options: ['a'],
        style: 'choice',
        question: 'Vecchia domanda',
        no_match_1: null,
        no_match_2: null,
        no_match_3: null,
      }],
    };
    const { storage, stats } = mergeDisambiguationPlanAfterCompute([row], '2026-06-18', previous);
    expect(storage.messages).toHaveLength(1);
    expect(storage.messages[0]?.signature).toBe(row.signature);
    expect(stats.reused).toBe(1);
    expect(stats.needsRewrite).toBe(0);
    expect(stats.droppedObsolete).toBe(1);
  });

  it('counts needsRewrite for rows without question', () => {
    const stats = summarizeDisambiguationMerge([row, emptyRow], null);
    expect(stats.reused).toBe(1);
    expect(stats.needsRewrite).toBe(1);
    expect(stats.total).toBe(2);
  });
});

describe('rowsNeedingDisambiguationMessages', () => {
  it('returns only rows without question', () => {
    const targets = rowsNeedingDisambiguationMessages([row, emptyRow]);
    expect(targets).toHaveLength(1);
    expect(targets[0]?.signature).toBe(emptyRow.signature);
  });
});

describe('patchDisambiguationPlanMessage', () => {
  it('updates question for matching signature', () => {
    const plan = {
      computedAt: '2026-06-18',
      messages: [{
        signature: row.signature,
        categoryName: row.categoryName,
        options: row.options,
        style: row.style,
        question: 'Vecchia',
        no_match_1: null,
        no_match_2: null,
        no_match_3: null,
      }],
    };
    const next = patchDisambiguationPlanMessage(plan, row.signature, { question: 'Nuova domanda' });
    expect(next.messages[0]?.question).toBe('Nuova domanda');
    expect(next.messages[0]?.source).toBe('manual');
  });
});

describe('buildVincoloAskSignature', () => {
  it('builds per-category vincolo signature', async () => {
    const { buildVincoloAskSignature, isVincoloAskSignature } = await import('./disambiguationPlanMessages');
    expect(buildVincoloAskSignature('fascia di età')).toBe('vincolo||fascia di età||ask');
    expect(isVincoloAskSignature('vincolo||fascia di età||ask')).toBe(true);
  });
});

describe('buildDisambiguationEditorRows vincolo', () => {
  it('includes ask_age rows from plan and dictionary vincolo categories', async () => {
    const { buildDisambiguationEditorRows, buildVincoloAskSignature } = await import('./disambiguationPlanMessages');
    const sig = buildVincoloAskSignature('fascia di età');
    const plan = {
      nodes: [{
        key: 'k1',
        signature: sig,
        acquired: {},
        ageYears: null,
        action: 'ask_age' as const,
        categoryName: 'fascia di età',
        options: ['> 17 anni'],
        style: 'ask_age' as const,
        candidateCount: 2,
        candidatePathsSample: [],
      }],
      stats: {
        catalogItemCount: 1,
        totalStates: 1,
        disambiguateNodes: 0,
        askAgeNodes: 1,
        confirmStates: 0,
        deadStates: 0,
        stuckStates: 0,
        uniqueDisambiguationBySignature: 0,
        uniqueDisambiguationByFullKey: 0,
        uniqueAgePatterns: 1,
      },
      computedAt: '2026-06-18',
      warnings: [],
    };
    const rows = buildDisambiguationEditorRows(plan, null, [{
      id: 'v1',
      name: 'fascia di età',
      order: 1,
      tokenTexts: ['> 17 anni'],
      type: 'vincolo',
    }]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.style).toBe('ask_age');
    expect(rows[0]?.answer_grammar).toBeNull();
  });

  it('merges distinct context variants under the same signature', async () => {
    const { buildDisambiguationEditorRows } = await import('./disambiguationPlanMessages');
    const signature = 'varie||arterioso+venoso|venoso||choice';
    const categories = [
      { id: 'c1', name: 'specialità', order: 0, tokenTexts: ['cardiologica'] },
      { id: 'c2', name: 'prestazione', order: 1, tokenTexts: ['ecodoppler', 'ecg'] },
      { id: 'c3', name: 'varie', order: 2, tokenTexts: ['arterioso+venoso', 'venoso'] },
    ];
    const plan = {
      nodes: [
        {
          key: 'k1',
          signature,
          acquired: { specialita: 'cardiologica', prestazione: 'ecodoppler' },
          ageYears: null,
          action: 'disambiguate' as const,
          categoryName: 'varie',
          options: ['arterioso+venoso', 'venoso'],
          style: 'choice' as const,
          candidateCount: 2,
          candidatePathsSample: ['cardiologica.ecodoppler.arterioso+venoso'],
        },
        {
          key: 'k2',
          signature,
          acquired: { specialita: 'cardiologica', prestazione: 'ecg' },
          ageYears: null,
          action: 'disambiguate' as const,
          categoryName: 'varie',
          options: ['arterioso+venoso', 'venoso'],
          style: 'choice' as const,
          candidateCount: 2,
          candidatePathsSample: ['cardiologica.ecg.venoso'],
        },
      ],
      stats: {
        catalogItemCount: 2,
        totalStates: 2,
        disambiguateNodes: 2,
        askAgeNodes: 0,
        confirmStates: 0,
        deadStates: 0,
        stuckStates: 0,
        uniqueDisambiguationBySignature: 1,
        uniqueDisambiguationByFullKey: 2,
        uniqueAgePatterns: 0,
      },
      computedAt: '2026-06-19',
      warnings: [],
    };

    const rows = buildDisambiguationEditorRows(plan, null, categories);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.contextCount).toBe(2);
    expect(rows[0]?.contextVariants).toHaveLength(2);
    expect(rows[0]?.contextVariants.map((v) => v.pathPrefix)).toEqual([
      'cardiologica.ecg',
      'cardiologica.ecodoppler',
    ]);
  });
});

describe('buildPlanResultFromStorage', () => {
  it('builds a displayable plan from saved messages', () => {
    const plan = buildPlanResultFromStorage({
      computedAt: '2026-06-18',
      messages: [{
        signature: row.signature,
        categoryName: row.categoryName,
        options: row.options,
        style: row.style,
        question: row.question,
        no_match_1: null,
        no_match_2: null,
        no_match_3: null,
      }],
    });
    expect(plan?.nodes).toHaveLength(1);
    expect(plan?.warnings[0]).toMatch(/ripristinato/i);
  });
});

describe('regenerateDisambiguationAnswerGrammars', () => {
  it('recompiles answer grammars and forces text mode', () => {
    const combinedRow: DisambiguationEditorRow = {
      ...row,
      signature: 'esami||ECG+Ecodoppler|Holter||choice',
      categoryName: 'esami',
      options: ['ECG+Ecodoppler', 'Holter'],
      answer_grammar: { regex: '(?<old>vecchia)', mappings: { old: 'ECG+Ecodoppler' } },
      answer_grammar_mode: 'graph',
      answer_grammar_graph: {
        id: 'g1',
        name: 'test',
        nodes: [],
        edges: [],
        semanticSets: [],
        metadata: { createdAt: 1, updatedAt: 1, version: '1.0.0' },
      },
    };

    const { rows: next, stats } = regenerateDisambiguationAnswerGrammars([combinedRow, row]);
    expect(stats.regenerated).toBe(2);
    expect(stats.skipped).toBe(0);

    const regenerated = next.find((r) => r.signature === combinedRow.signature)!;
    expect(regenerated.answer_grammar?.combinatorial).toBe(true);
    expect(regenerated.answer_grammar_graph).toBeNull();
    expect(regenerated.answer_grammar_mode).toBe('text');
  });

  it('skips ask_age rows unchanged', () => {
    const ageRow: DisambiguationEditorRow = {
      ...row,
      signature: 'vincolo||età||ask',
      style: 'ask_age',
      options: ['adulto'],
      answer_grammar: null,
    };
    const { rows: next, stats } = regenerateDisambiguationAnswerGrammars([ageRow]);
    expect(stats.skipped).toBe(1);
    expect(stats.regenerated).toBe(0);
    expect(next[0]).toEqual(ageRow);
  });
});
