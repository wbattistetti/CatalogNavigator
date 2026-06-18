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
