/**
 * Tests for natural opening utterance.
 */
import { describe, expect, it } from 'vitest';
import { buildNaturalOpeningUtterance } from './dialogTestPlanScripts';

describe('buildNaturalOpeningUtterance', () => {
  it('wraps corpus description in a booking phrase', () => {
    expect(buildNaturalOpeningUtterance('VISITA CARDIOLOGICA'))
      .toBe('Vorrei prenotare visita cardiologica');
  });
});
