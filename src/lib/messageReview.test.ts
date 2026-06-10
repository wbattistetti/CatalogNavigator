import { describe, expect, it } from 'vitest';
import type { AnalysisRow } from './analysisTypes';
import {
  buildRowFieldStatusUpdate,
  computeMessageReviewStats,
  getFieldMeta,
  stampDeterministicMessageLayer,
} from './messageReview';

function row(partial: Partial<AnalysisRow> & Pick<AnalysisRow, 'slot_filling'>): AnalysisRow {
  return {
    question: null,
    grammar: null,
    answer_grammar: null,
    no_match_1: null,
    no_match_2: null,
    no_match_3: null,
    confirmation_text: null,
    ...partial,
  };
}

describe('computeMessageReviewStats', () => {
  it('counts interactive message fields with content', () => {
    const rows = [
      row({
        slot_filling: 'a',
        question: 'Q?',
        no_match_1: 'N1',
        no_match_2: 'N2',
        no_match_3: 'N3',
        field_meta: {
          question: { status: 'approved', source: 'ai' },
          no_match_1: { status: 'approved', source: 'ai' },
        },
      }),
      row({ slot_filling: 'a.b' }),
    ];
    const stats = computeMessageReviewStats(rows, null);
    expect(stats.total).toBe(4);
    expect(stats.validated).toBe(2);
    expect(stats.pending).toBe(2);
    expect(stats.validatedPct).toBe(50);
  });

  it('migrates legacy row.status for question validation', () => {
    const rows = [
      row({
        slot_filling: 'x',
        question: 'Q?',
        no_match_1: 'N1',
        no_match_2: 'N2',
        no_match_3: 'N3',
        status: 'approved',
      }),
    ];
    expect(getFieldMeta(rows[0]!, 'question').status).toBe('approved');
    const stats = computeMessageReviewStats(rows, null);
    expect(stats.validated).toBe(1);
  });
});

describe('buildRowFieldStatusUpdate', () => {
  it('syncs row.status when validating question', () => {
    const r = row({ slot_filling: 'a', question: 'Q?' });
    const next = buildRowFieldStatusUpdate(r, 'question', 'approved');
    expect(next.status).toBe('approved');
    expect(next.field_meta?.question?.status).toBe('approved');
  });
});

describe('stampDeterministicMessageLayer', () => {
  it('marks interactive rows as deterministic', () => {
    const rows = [
      row({ slot_filling: 'root' }),
      row({
        slot_filling: 'root.a',
        question: 'Q?',
        no_match_1: 'N1',
        no_match_2: 'N2',
        no_match_3: 'N3',
      }),
      row({ slot_filling: 'root.b' }),
    ];
    const stamped = stampDeterministicMessageLayer(rows, null);
    const interactive = stamped.find((r) => r.slot_filling === 'root')!;
    expect(interactive.field_meta?.question?.source).toBe('deterministic');
    expect(stamped.find((r) => r.slot_filling === 'root.a')!.field_meta).toBeUndefined();
  });
});
