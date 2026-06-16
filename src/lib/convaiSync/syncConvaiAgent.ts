/**
 * Orchestrates ConvAI agent create/patch from compiled AgentBundle.
 * Runtime decisions live on the webhook backend — no ElevenLabs KB upload.
 */
import type { AgentBundle } from '../agentBundleTypes';
import { buildConvaiConversationConfig } from './buildConvaiConversationConfig';
import {
  ensureConvaiDeployTunnelReady,
  rewritePayloadWithDevTunnel,
} from './convaiDevTunnel';
import { stripPromptToolIdsForInlineToolsPatch } from './convaiInlineTools';
import type { ConvaiAgentLink } from './convaiAgentLink';
import { saveConvaiAgentLink } from './convaiAgentLink';
import {
  createConvaiAgent,
  patchConvaiAgent,
} from './convaiProvisionApi';

export interface SyncConvaiAgentInput {
  documentId: string;
  agentName: string;
  bundle: AgentBundle;
  /** Existing ElevenLabs agent id — update when set. */
  targetAgentId?: string | null;
  voiceId?: string | null;
  llm?: string;
  priorLink?: ConvaiAgentLink | null;
}

export interface SyncConvaiAgentResult {
  agentId: string;
  link: ConvaiAgentLink;
  deployedWithNgrok: boolean;
  publicBaseUrl: string | null;
  isAgentUpdate: boolean;
}

/** Creates or fully overwrites an ElevenLabs ConvAI agent with webhook dialog tool. */
export async function syncConvaiAgentFromBundle(
  input: SyncConvaiAgentInput,
): Promise<SyncConvaiAgentResult> {
  const targetAgentId = input.targetAgentId?.trim() ?? '';
  const isAgentUpdate = Boolean(targetAgentId);

  const publicBaseUrl = await ensureConvaiDeployTunnelReady();
  const gatewayOrigin = publicBaseUrl;

  const conversation_config = buildConvaiConversationConfig({
    bundle: input.bundle,
    documentId: input.documentId,
    voiceId: input.voiceId,
    llm: input.llm,
    gatewayOrigin,
  }) as Record<string, unknown>;

  let payload: { name: string; conversation_config: unknown } = {
    name: input.agentName.trim() || input.bundle.meta.documentName,
    conversation_config,
  };

  if (publicBaseUrl) {
    payload = rewritePayloadWithDevTunnel(payload, publicBaseUrl);
  }

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
    publicBaseUrl,
    deployMode: 'webhook',
  };

  await saveConvaiAgentLink(link);

  return {
    agentId,
    link,
    deployedWithNgrok: Boolean(publicBaseUrl),
    publicBaseUrl,
    isAgentUpdate,
  };
}
