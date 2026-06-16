/**
 * Deploys ConvAI agent with structured KB + algorithm system prompt (no webhook backend).
 */
import type { AgentBundle } from '../agentBundleTypes';
import type { ConvaiAgentLink } from './convaiAgentLink';
import { saveConvaiAgentLink } from './convaiAgentLink';
import { buildStructuredKbDocFromBundle } from './buildStructuredKbFromBundle';
import { buildConvaiConversationConfigNoBackend } from './buildConvaiConversationConfigNoBackend';
import { stripPromptToolIdsForInlineToolsPatch } from './convaiInlineTools';
import {
  createConvaiAgent,
  getConvaiAgentDetail,
  patchConvaiAgent,
} from './convaiProvisionApi';
import {
  readRemoteKbIdsOnAgent,
  syncConvaiKbDocuments,
} from './syncConvaiKbDocuments';

export interface SyncConvaiAgentNoBackendInput {
  documentId: string;
  agentName: string;
  bundle: AgentBundle;
  targetAgentId?: string | null;
  voiceId?: string | null;
  llm?: string;
  priorLink?: ConvaiAgentLink | null;
}

export interface SyncConvaiAgentNoBackendResult {
  agentId: string;
  link: ConvaiAgentLink;
  isAgentUpdate: boolean;
  kbItemCount: number;
}

/** Creates or updates an ElevenLabs agent with structured KB and no webhook tools. */
export async function syncConvaiAgentNoBackend(
  input: SyncConvaiAgentNoBackendInput,
): Promise<SyncConvaiAgentNoBackendResult> {
  const targetAgentId = input.targetAgentId?.trim() ?? '';
  const isAgentUpdate = Boolean(targetAgentId);
  const priorLink = input.priorLink ?? null;

  const kbDoc = buildStructuredKbDocFromBundle(input.bundle);

  let remoteIdsOnAgent: string[] = [];
  if (isAgentUpdate) {
    try {
      const detail = await getConvaiAgentDetail(targetAgentId);
      remoteIdsOnAgent = readRemoteKbIdsOnAgent(detail.conversationConfig);
    } catch {
      remoteIdsOnAgent = [];
    }
  }

  const kbSync = await syncConvaiKbDocuments({
    isAgentUpdate,
    kbDoc,
    kbRemoteByDocId: priorLink?.kbRemoteByDocId ?? {},
    lastKbRemoteIds: priorLink?.lastKbRemoteIds ?? [],
    remoteIdsOnAgent,
  });

  const conversation_config = buildConvaiConversationConfigNoBackend({
    bundle: input.bundle,
    kbRefs: kbSync.kbRefs,
    voiceId: input.voiceId,
    llm: input.llm,
  });

  const payload: { name: string; conversation_config: unknown } = {
    name: input.agentName.trim() || input.bundle.meta.documentName,
    conversation_config,
  };

  let agentId = targetAgentId;

  if (isAgentUpdate) {
    if (payload.conversation_config && typeof payload.conversation_config === 'object') {
      stripPromptToolIdsForInlineToolsPatch(payload.conversation_config as Record<string, unknown>);
    }
    await patchConvaiAgent(agentId, payload);
  } else {
    const created = await createConvaiAgent(payload);
    agentId = created.agentId;
  }

  const link: ConvaiAgentLink = {
    schemaVersion: 1,
    documentId: input.documentId,
    agentId,
    agentName: payload.name,
    lastSyncedAt: new Date().toISOString(),
    bundleCompiledAt: input.bundle.meta.compiledAt,
    publicBaseUrl: null,
    deployMode: 'no-backend',
    kbRemoteByDocId: kbSync.kbRemoteByDocId,
    lastKbRemoteIds: kbSync.lastKbRemoteIds,
  };

  await saveConvaiAgentLink(link);

  return {
    agentId,
    link,
    isAgentUpdate,
    kbItemCount: input.bundle.corpusItems.length,
  };
}
