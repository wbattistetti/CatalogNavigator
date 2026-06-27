/**
 * Orchestrates ConvAI agent create/patch from compiled AgentBundle.
 * Runtime decisions live on the webhook backend — no ElevenLabs KB upload.
 */
import type { AgentBundle } from '../agentBundleTypes';
import { buildAgentDialogStepTool } from './buildAgentDialogStepTool';
import { buildConvaiConversationConfig } from './buildConvaiConversationConfig';
import {
  ensureConvaiDeployTunnelReady,
  rewritePayloadWithDevTunnel,
} from './convaiDevTunnel';
import type { ConvaiAgentLink } from './convaiAgentLink';
import { saveConvaiAgentLink } from './convaiAgentLink';
import {
  createConvaiAgent,
  createConvaiWorkspaceTool,
  patchConvaiAgent,
  patchConvaiWorkspaceTool,
} from './convaiProvisionApi';
import { resolveAgentDialogStepToolId } from './convaiWorkspaceTool';

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
  workspaceToolId: string;
}

/** Ensures one workspace tool exists and is patched with the current webhook URL. */
async function syncAgentDialogStepWorkspaceTool(
  documentId: string,
  gatewayOrigin: string | undefined,
  isAgentUpdate: boolean,
  agentId: string,
  priorLink: ConvaiAgentLink | null | undefined,
): Promise<string> {
  const toolConfig = buildAgentDialogStepTool(documentId, gatewayOrigin);

  if (isAgentUpdate) {
    const workspaceToolId = priorLink?.workspaceToolId?.trim()
      || await resolveAgentDialogStepToolId(agentId, documentId, priorLink);
    if (workspaceToolId) {
      await patchConvaiWorkspaceTool(workspaceToolId, toolConfig);
      return workspaceToolId;
    }
  }

  return createConvaiWorkspaceTool(toolConfig);
}

/** Creates or fully overwrites an ElevenLabs ConvAI agent with webhook dialog tool. */
export async function syncConvaiAgentFromBundle(
  input: SyncConvaiAgentInput,
): Promise<SyncConvaiAgentResult> {
  const targetAgentId = input.targetAgentId?.trim() ?? '';
  const isAgentUpdate = Boolean(targetAgentId);

  const publicBaseUrl = await ensureConvaiDeployTunnelReady();
  const gatewayOrigin = publicBaseUrl ?? undefined;

  let agentId = targetAgentId;
  const workspaceToolId = await syncAgentDialogStepWorkspaceTool(
    input.documentId,
    gatewayOrigin,
    isAgentUpdate,
    agentId,
    input.priorLink,
  );

  const conversation_config = buildConvaiConversationConfig({
    bundle: input.bundle,
    documentId: input.documentId,
    voiceId: input.voiceId,
    llm: input.llm,
    gatewayOrigin,
    workspaceToolId,
  }) as Record<string, unknown>;

  let payload: { name: string; conversation_config: unknown } = {
    name: input.agentName.trim() || input.bundle.meta.documentName,
    conversation_config,
  };

  if (publicBaseUrl) {
    payload = rewritePayloadWithDevTunnel(payload, publicBaseUrl);
  }

  if (isAgentUpdate) {
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
    workspaceToolId,
    deployMode: 'webhook',
  };

  await saveConvaiAgentLink(link);

  return {
    agentId,
    link,
    deployedWithNgrok: Boolean(publicBaseUrl),
    publicBaseUrl,
    isAgentUpdate,
    workspaceToolId,
  };
}
