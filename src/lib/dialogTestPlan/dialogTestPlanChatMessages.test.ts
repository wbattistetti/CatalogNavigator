/**
 * Tests for Test Plan chat message builder.
 */
import { describe, expect, it } from 'vitest';
import { buildTestPlanChatMessages } from './dialogTestPlanChatMessages';

describe('buildTestPlanChatMessages', () => {
  it('includes opening question and alternating bubbles with options', () => {
    const messages = buildTestPlanChatMessages('Ciao, cosa cerchi?', [
      {
        userText: 'cardiologica',
        spokenHint: 'Prima visita o controllo?',
        action: 'disambiguate',
        disambiguationCategory: 'tipo visita',
        disambiguationOptions: ['prima visita', 'controllo'],
      },
    ]);

    expect(messages[0]?.role).toBe('agent');
    expect(messages[2]?.disambiguationOptions).toEqual(['prima visita', 'controllo']);
  });
});
