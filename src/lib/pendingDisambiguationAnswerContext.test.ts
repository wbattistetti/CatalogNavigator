/**
 * Tests for pending disambiguation answer context helpers.
 */
import { describe, expect, it } from 'vitest';
import type { AgentSessionState } from './agentBundleTypes';
import {
  buildAnswerContextFromPending,
  describePendingSessionMismatch,
  sessionPendingMatchesContext,
} from './pendingDisambiguationAnswerContext';

describe('pendingDisambiguationAnswerContext', () => {
  it('builds context from pending bubble metadata', () => {
    const ctx = buildAnswerContextFromPending({
      signature: 'esame||ecg||optional_include',
      categoryName: 'esame',
      options: ['ecg', 'none'],
    });
    expect(ctx).toEqual({
      categoryName: 'esame',
      options: ['ecg', 'none'],
      signature: 'esame||ecg||optional_include',
      valueKind: 'canonical_token',
    });
  });

  it('detects session pending mismatch', () => {
    const session: AgentSessionState = {
      acquiredConcepts: [],
      selectedPath: null,
      noMatchCount: 0,
      pendingExpectedInput: [{
        categoryName: 'esame',
        valueKind: 'canonical_token',
        description: '',
        allowedTokens: ['ecg', 'none'],
      }],
    };
    const context = {
      categoryName: 'esame',
      options: ['ecografia+mammografia', 'none'],
      valueKind: 'canonical_token' as const,
    };
    expect(sessionPendingMatchesContext(session, context)).toBe(false);
    expect(describePendingSessionMismatch(session, context)).toContain('≠ domanda in chat');
  });

  it('flags missing session pending when context is present', () => {
    const session: AgentSessionState = {
      acquiredConcepts: [{ category: 'specialità', values: ['senologica'] }],
      selectedPath: null,
      noMatchCount: 0,
    };
    const context = {
      categoryName: 'esame',
      options: ['ecografia+mammografia', 'none'],
      valueKind: 'canonical_token' as const,
    };
    expect(sessionPendingMatchesContext(session, context)).toBe(false);
    expect(describePendingSessionMismatch(session, context)).toContain('assente in vbSession');
  });
});
