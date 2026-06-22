import { describe, expect, it } from 'vitest';
import type { Analysis } from './analysisTypes';
import { hasOntologyItemPaths, hasPersistableAnalysisState } from './analysisReadiness';

function analysis(partial: Partial<Analysis>): Analysis {
  return {
    id: 'a1',
    document_id: 'd1',
    rows: [],
    item_paths: null,
    start_question: null,
    confirmation_preamble: 'Quindi confermo:',
    disambiguation_plan: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('hasPersistableAnalysisState', () => {
  it('is true when item_paths exist', () => {
    expect(hasPersistableAnalysisState(analysis({ item_paths: ['a > b'] }))).toBe(true);
    expect(hasOntologyItemPaths(analysis({ item_paths: ['a > b'] }))).toBe(true);
  });

  it('is true when disambiguation plan has computedAt even without item_paths', () => {
    expect(hasPersistableAnalysisState(analysis({
      item_paths: null,
      disambiguation_plan: { computedAt: '2026-06-22T12:00:00.000Z', messages: [] },
    }))).toBe(true);
    expect(hasOntologyItemPaths(analysis({ item_paths: null }))).toBe(false);
  });

  it('is true when disambiguation messages have copy', () => {
    expect(hasPersistableAnalysisState(analysis({
      disambiguation_plan: {
        computedAt: null,
        messages: [{
          signature: 'sig',
          categoryName: 'cat',
          options: ['a'],
          question: 'Quale?',
          no_match_1: '1',
          no_match_2: '2',
          no_match_3: '3',
        }],
      },
    }))).toBe(true);
  });

  it('is false for empty analysis shell', () => {
    expect(hasPersistableAnalysisState(null)).toBe(false);
    expect(hasPersistableAnalysisState(analysis({}))).toBe(false);
  });
});
