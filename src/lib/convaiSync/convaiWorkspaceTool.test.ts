/**
 * Unit tests for workspace tool resolution (no duplicate agent_dialog_step on redeploy).
 */
import { describe, expect, it } from 'vitest';
import {
  attachWorkspaceToolToConversationConfig,
  extractToolIdsFromConvaiConfig,
  parseConvaiWorkspaceToolList,
  pickAgentDialogStepToolId,
} from './convaiWorkspaceTool';
import { AGENT_DIALOG_STEP_TOOL_NAME } from './buildAgentDialogStepTool';

describe('extractToolIdsFromConvaiConfig', () => {
  it('reads tool_ids from agent prompt', () => {
    const ids = extractToolIdsFromConvaiConfig({
      agent: { prompt: { tool_ids: ['tool_abc', 'tool_xyz'] } },
    });
    expect(ids).toEqual(['tool_abc', 'tool_xyz']);
  });
});

describe('attachWorkspaceToolToConversationConfig', () => {
  it('sets tool_ids and clears inline tools', () => {
    const cfg: Record<string, unknown> = {
      agent: {
        prompt: {
          tools: [{ name: 'agent_dialog_step' }],
          tool_ids: [],
        },
      },
    };
    attachWorkspaceToolToConversationConfig(cfg, 'tool_live');
    const prompt = (cfg.agent as Record<string, unknown>).prompt as Record<string, unknown>;
    expect(prompt.tool_ids).toEqual(['tool_live']);
    expect(prompt.tools).toEqual([]);
  });
});

describe('pickAgentDialogStepToolId', () => {
  const tools = [
    {
      id: 'tool_old',
      name: AGENT_DIALOG_STEP_TOOL_NAME,
      webhookUrl: 'https://old.ngrok-free.app/api/runtime/agent-dialog-step/doc-1',
    },
    {
      id: 'tool_other_doc',
      name: AGENT_DIALOG_STEP_TOOL_NAME,
      webhookUrl: 'https://x.ngrok-free.app/api/runtime/agent-dialog-step/doc-2',
    },
  ];

  it('prefers saved workspaceToolId when still present', () => {
    expect(pickAgentDialogStepToolId(tools, 'doc-1', 'tool_old')).toBe('tool_old');
  });

  it('matches tool by document id in webhook URL', () => {
    expect(pickAgentDialogStepToolId(tools, 'doc-1')).toBe('tool_old');
  });
});

describe('parseConvaiWorkspaceToolList', () => {
  it('parses tools wrapper with tool_config', () => {
    const list = parseConvaiWorkspaceToolList({
      tools: [{
        id: 'tool_1',
        tool_config: {
          name: 'agent_dialog_step',
          api_schema: { url: 'https://t.ngrok-free.app/api/runtime/agent-dialog-step/doc-1' },
        },
      }],
    });
    expect(list).toEqual([{
      id: 'tool_1',
      name: 'agent_dialog_step',
      webhookUrl: 'https://t.ngrok-free.app/api/runtime/agent-dialog-step/doc-1',
    }]);
  });

  it('parses a single tool GET response', () => {
    const list = parseConvaiWorkspaceToolList({
      id: 'tool_2',
      tool_config: {
        name: 'agent_dialog_step',
        api_schema: { url: 'https://x.ngrok-free.app/api/runtime/agent-dialog-step/doc-9' },
      },
    });
    expect(list[0]?.id).toBe('tool_2');
  });
});
