/**
 * Tests for ElevenLabs webhook tool schema (required property descriptions).
 */
import { describe, expect, it } from 'vitest';
import { buildAgentDialogStepTool } from './buildAgentDialogStepTool';

describe('buildAgentDialogStepTool', () => {
  it('binds conversationId to ElevenLabs system__conversation_id', () => {
    const tool = buildAgentDialogStepTool('doc-1', 'https://tunnel.ngrok-free.app');
    const schema = tool.api_schema.request_body_schema as {
      properties: {
        conversationId: { dynamic_variable?: string; description?: string };
        incomingSlots: {
          items: { properties: Record<string, { description?: string }> };
        };
      };
      required: string[];
    };

    expect(schema.required).toEqual(['conversationId', 'incomingSlots']);
    expect(schema.properties.conversationId.dynamic_variable).toBe('system__conversation_id');
    expect(schema.properties.conversationId.description).toBeUndefined();
    expect(schema.properties.incomingSlots.items.properties.categoryName.description).toBeTruthy();
    expect(schema.properties.incomingSlots.items.properties.value.description).toBeTruthy();
  });
});
