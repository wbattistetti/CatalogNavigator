/**
 * Extracts knowledge-base document ids from ElevenLabs conversation_config payloads.
 */

export interface ConvaiKbRef {
  id: string;
  name?: string;
  type?: string;
  usage_mode?: string;
}

function readKbRefsFromPrompt(prompt: unknown): ConvaiKbRef[] {
  if (!prompt || typeof prompt !== 'object') return [];
  const kb = (prompt as Record<string, unknown>).knowledge_base;
  if (!Array.isArray(kb)) return [];
  return kb
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item != null)
    .map((item) => ({
      id: String(item.id ?? '').trim(),
      name: typeof item.name === 'string' ? item.name : undefined,
      type: typeof item.type === 'string' ? item.type : undefined,
      usage_mode: typeof item.usage_mode === 'string' ? item.usage_mode : undefined,
    }))
    .filter((ref) => ref.id.length > 0);
}

/** Reads KB document ids currently attached to an agent conversation_config. */
export function extractKnowledgeBaseDocumentIdsFromConvaiConfig(
  conversationConfig: unknown,
): string[] {
  if (!conversationConfig || typeof conversationConfig !== 'object') return [];
  const cfg = conversationConfig as Record<string, unknown>;
  const agent = cfg.agent;
  if (!agent || typeof agent !== 'object') return [];
  const refs = readKbRefsFromPrompt((agent as Record<string, unknown>).prompt);
  return [...new Set(refs.map((r) => r.id))];
}

/** Builds ElevenLabs knowledge_base attachment refs for agent prompt. */
export function buildConvaiKbAttachmentRefs(
  docs: Array<{ remoteId: string; name: string }>,
): ConvaiKbRef[] {
  return docs.map((doc) => ({
    type: 'file',
    name: doc.name,
    id: doc.remoteId,
    usage_mode: 'auto',
  }));
}
