/**

 * Workspace-level ElevenLabs webhook tool for agent_dialog_step (single tool, updated in place).

 */

import { AGENT_DIALOG_STEP_TOOL_NAME, buildAgentDialogStepTool } from './buildAgentDialogStepTool';

import type { ConvaiAgentLink } from './convaiAgentLink';

import {

  getConvaiAgentDetail,

  getConvaiWorkspaceTool,

  listConvaiWorkspaceTools,

} from './convaiProvisionApi';



export type AgentDialogStepToolConfig = ReturnType<typeof buildAgentDialogStepTool>;



export interface ConvaiWorkspaceToolSummary {

  id: string;

  name: string;

  webhookUrl: string | null;

}



/** Reads tool_ids from an ElevenLabs conversation_config payload. */

export function extractToolIdsFromConvaiConfig(conversationConfig: unknown): string[] {

  if (!conversationConfig || typeof conversationConfig !== 'object') return [];

  const agent = (conversationConfig as Record<string, unknown>).agent;

  if (!agent || typeof agent !== 'object') return [];

  const prompt = (agent as Record<string, unknown>).prompt;

  if (!prompt || typeof prompt !== 'object') return [];

  const toolIds = (prompt as Record<string, unknown>).tool_ids;

  if (!Array.isArray(toolIds)) return [];

  return toolIds

    .map((id) => String(id ?? '').trim())

    .filter(Boolean);

}



/** Attaches a workspace tool by id (PATCH must not send inline tools + tool_ids). */

export function attachWorkspaceToolToConversationConfig(

  conversationConfig: Record<string, unknown>,

  workspaceToolId: string,

): void {

  const agent = conversationConfig.agent;

  if (!agent || typeof agent !== 'object') return;

  const prompt = (agent as Record<string, unknown>).prompt;

  if (!prompt || typeof prompt !== 'object') return;

  const trimmed = workspaceToolId.trim();

  (prompt as Record<string, unknown>).tool_ids = [trimmed];

  (prompt as Record<string, unknown>).tools = [];

}



/** Parses list-tools API rows into summaries. */

export function parseConvaiWorkspaceToolList(raw: unknown): ConvaiWorkspaceToolSummary[] {

  const rows = Array.isArray(raw)

    ? raw

    : (typeof raw === 'object' && raw != null && Array.isArray((raw as { tools?: unknown }).tools))

      ? (raw as { tools: unknown[] }).tools

      : (typeof raw === 'object' && raw != null && (raw as { id?: unknown }).id)

        ? [raw]

        : [];



  return rows

    .filter((row): row is Record<string, unknown> => typeof row === 'object' && row != null)

    .map((row) => {

      const id = String(row.id ?? row.tool_id ?? '').trim();

      const toolConfig = row.tool_config;

      const cfg = typeof toolConfig === 'object' && toolConfig != null

        ? toolConfig as Record<string, unknown>

        : row;

      const name = String(cfg.name ?? '').trim();

      const apiSchema = cfg.api_schema;

      const url = typeof apiSchema === 'object' && apiSchema != null

        ? String((apiSchema as Record<string, unknown>).url ?? '').trim()

        : '';

      return { id, name, webhookUrl: url || null };

    })

    .filter((row) => row.id.length > 0);

}



/** Picks the best existing workspace tool id for agent_dialog_step. */

export function pickAgentDialogStepToolId(

  candidates: ConvaiWorkspaceToolSummary[],

  documentId: string,

  preferredId?: string | null,

): string | null {

  if (preferredId?.trim()) {

    const hit = candidates.find((c) => c.id === preferredId.trim());

    if (hit) return hit.id;

  }



  const named = candidates.filter((c) => c.name === AGENT_DIALOG_STEP_TOOL_NAME);

  if (named.length === 0) return null;



  const docPath = `/agent-dialog-step/${documentId.trim()}`;

  const forDocument = named.filter((c) => c.webhookUrl?.includes(docPath));

  if (forDocument.length === 1) return forDocument[0]!.id;

  if (forDocument.length > 1) return forDocument[0]!.id;



  return named[0]!.id;

}



async function loadToolsByIds(toolIds: string[]): Promise<ConvaiWorkspaceToolSummary[]> {

  const loaded: ConvaiWorkspaceToolSummary[] = [];

  for (const id of toolIds) {

    const tool = await getConvaiWorkspaceTool(id);

    if (tool) loaded.push(tool);

  }

  return loaded;

}



/** Resolves workspace tool id from saved link, agent tool_ids, or workspace list. */

export async function resolveAgentDialogStepToolId(

  agentId: string,

  documentId: string,

  priorLink?: ConvaiAgentLink | null,

): Promise<string | null> {

  const fromLink = priorLink?.workspaceToolId?.trim();

  if (fromLink) return fromLink;



  const detail = await getConvaiAgentDetail(agentId);

  const attachedIds = extractToolIdsFromConvaiConfig(detail.conversationConfig);



  if (attachedIds.length > 0) {

    const attached = await loadToolsByIds(attachedIds);

    const picked = pickAgentDialogStepToolId(attached, documentId);

    if (picked) return picked;

    if (attachedIds.length === 1) return attachedIds[0]!;

  }



  try {

    const allTools = await listConvaiWorkspaceTools();

    return pickAgentDialogStepToolId(allTools, documentId);

  } catch {

    return attachedIds[0] ?? null;

  }

}


