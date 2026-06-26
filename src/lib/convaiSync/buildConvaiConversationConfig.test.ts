/**
 * Tests for dumb voice relay ConvAI conversation config.
 */
import { describe, expect, it } from 'vitest';
import {
  buildConvaiConversationConfig,
  compileVoiceRelayPrompt,
  DEFAULT_CONVAI_RELAY_LLM,
} from './buildConvaiConversationConfig';
import type { AgentBundle } from '../agentBundleTypes';

function minimalBundle(documentName: string): AgentBundle {
  return {
    meta: { documentName, documentId: 'doc-1', compiledAt: '2026-01-01T00:00:00Z', mode: 'preview', warnings: [] },
    dictionary: { categories: [] },
    ontology: { startQuestion: 'Quale prestazione desidera?' },
    analysis: { start_question: 'Quale prestazione desidera?' },
    catalog: { items: [] },
    corpusItems: [],
  } as unknown as AgentBundle;
}

describe('compileVoiceRelayPrompt', () => {
  it('instructs verbatim spokenHint and transcript-only tool calls', () => {
    const prompt = compileVoiceRelayPrompt(minimalBundle('Nuove prestazioni'));
    expect(prompt).toContain('Nuove prestazioni');
    expect(prompt).toContain('agent_dialog_step');
    expect(prompt).toContain('spokenHint');
    expect(prompt).toContain('ESATTAMENTE');
    expect(prompt).not.toContain('incomingSlots');
  });
});

describe('buildConvaiConversationConfig', () => {
  it('uses relay LLM and webhook tool without knowledge base', () => {
    const config = buildConvaiConversationConfig({
      bundle: minimalBundle('Test'),
      documentId: 'doc-1',
    }) as {
      agent: {
        first_message: string;
        prompt: { llm: string; tools: unknown[]; knowledge_base: unknown[]; prompt: string };
      };
    };

    expect(config.agent.first_message).toBe('Quale prestazione desidera?');
    expect(config.agent.prompt.llm).toBe(DEFAULT_CONVAI_RELAY_LLM);
    expect(config.agent.prompt.tools).toHaveLength(1);
    expect(config.agent.prompt.knowledge_base).toEqual([]);
    expect(config.agent.prompt.prompt).toContain('ponte vocale');
  });
});
