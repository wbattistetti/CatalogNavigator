/**
 * Tests for agent spoken hints.
 */
import { describe, expect, it } from 'vitest';
import {
  buildAttributeSpokenHint,
  formatImplicitSlotConfirmHint,
} from './agentDialogPhrases';

describe('agentDialogPhrases', () => {
  it('formats yes/no hint for implicit tipo visita slot', () => {
    expect(formatImplicitSlotConfirmHint('tipo visita', 'prima')).toBe('È una prima visita?');
    expect(formatImplicitSlotConfirmHint('tipo visita', 'controllo')).toBe(
      'È una visita di controllo?',
    );
  });

  it('lists two options as binary choice', () => {
    expect(buildAttributeSpokenHint('target', ['adulto', 'pediatrica'])).toBe(
      'Per target, preferisce adulto o pediatrica?',
    );
  });

  it('lists three or more options', () => {
    expect(buildAttributeSpokenHint('target', ['adulto', 'pediatrica', 'neonatale'])).toBe(
      'Per target, preferisce adulto, pediatrica o neonatale?',
    );
  });
});
