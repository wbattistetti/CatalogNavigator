/**
 * Tests for correction intent parsing (mirrors VB CorrectionIntent).
 */
import { describe, expect, it } from 'vitest';
import { normalizeCorrectionPayload, parseCorrectionIntent } from './correctionIntent';

describe('parseCorrectionIntent', () => {
  it('detects scusi intendevo with normalized payload', () => {
    expect(parseCorrectionIntent('scusi intendevo una radiologica')).toEqual({
      isCorrection: true,
      payloadText: 'radiologica',
    });
  });

  it('detects scusa volevo with normalized payload', () => {
    expect(parseCorrectionIntent('scusa volevo una radiologica')).toEqual({
      isCorrection: true,
      payloadText: 'radiologica',
    });
  });

  it('returns false for normal disambiguation answers', () => {
    expect(parseCorrectionIntent('ecg').isCorrection).toBe(false);
  });
});

describe('normalizeCorrectionPayload', () => {
  it('strips articles and intent filler', () => {
    expect(normalizeCorrectionPayload('volevo una radiologica')).toBe('radiologica');
  });
});
