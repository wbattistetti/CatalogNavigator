/**
 * Unit tests for ConvAI sync helpers (inline tools, KB extract, agent list parse).
 */
import { describe, expect, it } from 'vitest';
import { stripPromptToolIdsForInlineToolsPatch } from './convaiInlineTools';
import {
  buildConvaiKbAttachmentRefs,
  extractKnowledgeBaseDocumentIdsFromConvaiConfig,
} from './convaiKbExtract';
import {
  formatConvaiAgentDisplayName,
  sortAgentsForDesignerPicker,
} from './convaiAgentList';
import { suggestConvaiAgentName } from './convaiAgentName';
import { parseConvaiAgentList } from './convaiProvisionApi';

describe('stripPromptToolIdsForInlineToolsPatch', () => {
  it('clears tool_ids on agent prompt', () => {
    const cfg: Record<string, unknown> = {
      agent: {
        prompt: {
          tool_ids: ['tool_old'],
          tools: [{ name: 'agent_dialog_step' }],
        },
      },
    };
    stripPromptToolIdsForInlineToolsPatch(cfg);
    const prompt = (cfg.agent as Record<string, unknown>).prompt as Record<string, unknown>;
    expect(prompt.tool_ids).toEqual([]);
    expect(prompt.tools).toHaveLength(1);
  });
});

describe('extractKnowledgeBaseDocumentIdsFromConvaiConfig', () => {
  it('reads knowledge_base ids from conversation_config', () => {
    const ids = extractKnowledgeBaseDocumentIdsFromConvaiConfig({
      agent: {
        prompt: {
          knowledge_base: [
            { id: 'kb1', name: 'Doc A' },
            { id: 'kb2', name: 'Doc B' },
          ],
        },
      },
    });
    expect(ids).toEqual(['kb1', 'kb2']);
  });
});

describe('buildConvaiKbAttachmentRefs', () => {
  it('builds auto usage refs', () => {
    const refs = buildConvaiKbAttachmentRefs([{ remoteId: 'kb1', name: 'KB' }]);
    expect(refs[0]).toMatchObject({ id: 'kb1', name: 'KB', usage_mode: 'auto', type: 'file' });
  });
});

describe('parseConvaiAgentList', () => {
  it('parses agents array wrapper', () => {
    const list = parseConvaiAgentList({
      agents: [{ agent_id: 'a1', name: 'Monica', last_7_day_call_count: 3 }],
    });
    expect(list[0]).toMatchObject({
      agentId: 'a1',
      name: 'Monica',
      displayName: 'Monica',
      last7DayCallCount: 3,
    });
  });
});

describe('formatConvaiAgentDisplayName', () => {
  it('shortens Omnia auto names', () => {
    const label = formatConvaiAgentDisplayName(
      'OMNIA_default_project_0_main_node__GUID_g_abc',
      'agent_5801ktbkfef1fqw9j7jswkaqjh2d',
    );
    expect(label).toBe('Clone Omnia · …wkaqjh2d');
  });
});

describe('sortAgentsForDesignerPicker', () => {
  it('puts frequently used readable agents first', () => {
    const sorted = sortAgentsForDesignerPicker([
      {
        agentId: 'a1',
        name: 'OMNIA_default_project_x',
        displayName: 'Clone Omnia · …111',
        last7DayCallCount: 0,
        archived: false,
        isOmniaAutoName: true,
      },
      {
        agentId: 'a2',
        name: 'nuovo con doc formattato',
        displayName: 'nuovo con doc formattato',
        last7DayCallCount: 49,
        archived: false,
        isOmniaAutoName: false,
      },
    ]);
    expect(sorted[0]?.agentId).toBe('a2');
  });
});

describe('suggestConvaiAgentName', () => {
  it('prefixes document title with R&D Omnia', () => {
    expect(suggestConvaiAgentName('Nuove prestazioni Monica.ods')).toBe(
      'R&D Omnia - Nuove prestazioni Monica.ods',
    );
  });
});
