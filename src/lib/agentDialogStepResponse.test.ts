/**
 * Tests for agent-dialog-step HTTP response mapping.
 */
import { describe, expect, it } from 'vitest';
import {
  buildAgentDialogStepHttpResponse,
  formatInstructionLog,
} from './agentDialogStepResponse';
import type { AgentTurnResult } from './agentBundleTypes';

describe('agentDialogStepResponse', () => {
  it('maps turn result to voice + debug fields', () => {
    const result: AgentTurnResult = {
      instruction: {
        action: 'disambiguate',
        categoryName: 'target',
        options: ['adulto', 'pediatrica'],
      },
      parsed: [{ categoryName: 'specialità', value: 'cardiologica' }],
      spokenHint: 'Per target, preferisce adulto o pediatrica?',
      candidateCount: 2,
      nextState: {
        acquiredConcepts: [{ category: 'specialita', values: ['cardiologica'], kind: 'attributo' }],
        selectedPath: null,
        noMatchCount: 0,
      },
    };

    const http = buildAgentDialogStepHttpResponse('c1', 'doc1', result);
    expect(http.spokenHint).toBe('Per target, preferisce adulto o pediatrica?');
    expect(http.candidateCount).toBe(2);
    expect(http.debug.log).toBe('DISAMBIGUATE: category=target');
    expect(http.debug.parsedBlock).toContain('PROSSIMA_AZIONE: disambiguate');
    expect(http.debug.nextState.acquiredConcepts[0]?.values).toEqual(['cardiologica']);
    expect(formatInstructionLog({ action: 'no_match' })).toBe('NO_MATCH');
    expect(
      formatInstructionLog({
        action: 'confirm_implicit',
        categoryName: 'tipo visita',
        implicitValue: 'prima',
      }),
    ).toBe('CONFIRM_IMPLICIT: category=tipo visita value=prima');
  });
});
