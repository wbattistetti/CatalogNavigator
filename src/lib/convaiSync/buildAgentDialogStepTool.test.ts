/**
 * Tests for ElevenLabs webhook tool schema (relay mode).
 */
import { describe, expect, it } from 'vitest';
import { buildAgentDialogStepTool } from './buildAgentDialogStepTool';

describe('buildAgentDialogStepTool', () => {
  it('binds conversationId to ElevenLabs system__conversation_id and requires transcript', () => {
    const tool = buildAgentDialogStepTool('doc-1', 'https://tunnel.ngrok-free.app');
    const schema = tool.api_schema.request_body_schema as {
      properties: {
        conversationId: { dynamic_variable?: string; description?: string };
        transcript: { description?: string };
      };
      required: string[];
    };

    expect(schema.required).toEqual(['conversationId', 'transcript']);
    expect(schema.properties.conversationId.dynamic_variable).toBe('system__conversation_id');
    expect(schema.properties.conversationId.description).toBeUndefined();
    expect(schema.properties.transcript.description).toContain('Trascrizione');
    expect(tool.description).toContain('spokenHint');
  });
});
