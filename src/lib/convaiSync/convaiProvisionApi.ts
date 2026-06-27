/**
 * Client HTTP verso gateway locale per provision ConvAI (create/patch agent, KB, tools).
 */
import {
  filterConvaiAgentsBySearch,
  parseConvaiAgentListPage,
  sortAgentsForDesignerPicker,
} from './convaiAgentList';
import { convaiGatewayOrigin } from './convaiDevTunnel';
import {
  parseConvaiWorkspaceToolList,
  type AgentDialogStepToolConfig,
  type ConvaiWorkspaceToolSummary,
} from './convaiWorkspaceTool';

export interface CreateAgentResponse {
  agent_id?: string;
  agentId?: string;
  [key: string]: unknown;
}

export interface ConvaiAgentSummary {
  agentId: string;
  name: string;
  displayName: string;
  last7DayCallCount: number;
  archived: boolean;
  isOmniaAutoName: boolean;
}

export interface ConvaiAgentDetail {
  agentId: string;
  name: string;
  conversationConfig: unknown;
}

export interface ConvaiKbDocumentSummary {
  id: string;
  name: string;
}

function gatewayBase(): string {
  return convaiGatewayOrigin().replace(/\/$/, '');
}

function formatElevenLabsErrorBody(raw: unknown, status: number, label: string): string {
  if (typeof raw !== 'object' || raw == null) {
    return `${label} failed: ${status}`;
  }

  if ('error' in raw && typeof (raw as { error: unknown }).error === 'string') {
    return (raw as { error: string }).error;
  }

  const detail = (raw as { detail?: unknown }).detail;
  if (Array.isArray(detail)) {
    const lines = detail
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item != null)
      .map((item) => {
        const loc = Array.isArray(item.loc) ? item.loc.join('.') : '';
        const msg = typeof item.msg === 'string' ? item.msg : JSON.stringify(item);
        return loc ? `${loc}: ${msg}` : msg;
      });
    if (lines.length > 0) return lines.join(' | ');
  }

  if (typeof detail === 'object' && detail != null && 'message' in detail) {
    return String((detail as { message: string }).message);
  }

  return `${label} failed: ${status} ${JSON.stringify(raw)}`;
}

/** Parses gateway JSON; ElevenLabs DELETE/PATCH may return an empty body. */
async function parseJsonResponse<T>(res: Response, label: string): Promise<T> {
  const text = await res.text();

  if (!res.ok) {
    const gatewayHint = formatGatewayToolsRouteHint(res.status, label, text, res.headers.get('content-type'));
    if (gatewayHint) throw new Error(gatewayHint);

    let raw: unknown = {};
    if (text.trim()) {
      try {
        raw = JSON.parse(text) as unknown;
      } catch {
        throw new Error(`${label} failed: ${res.status} — risposta non JSON`);
      }
    }
    throw new Error(formatElevenLabsErrorBody(raw, res.status, label));
  }

  let raw: unknown = {};
  if (text.trim()) {
    try {
      raw = JSON.parse(text) as unknown;
    } catch {
      throw new Error(`${label} failed: ${res.status} — risposta non JSON`);
    }
  }
  return raw as T;
}

const GATEWAY_TOOLS_ROUTE_HINT =
  'Gateway ConvAI non aggiornato: chiudi la finestra be:gateway e rilancia npm run dev:convai '
  + '(mancano le route /elevenlabs/tools).';

function formatGatewayToolsRouteHint(
  status: number,
  label: string,
  body: string,
  contentType: string | null,
): string | null {
  if (status !== 404) return null;
  if (!/Tool$/i.test(label)) return null;
  // Express unmatched route returns HTML/plain; proxied ElevenLabs errors are JSON.
  if (contentType?.includes('application/json')) return null;
  const trimmed = body.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return null;
  return `${label} failed: 404 — ${GATEWAY_TOOLS_ROUTE_HINT}`;
}

function pickAgentId(row: Record<string, unknown>): string {
  const id = row.agent_id ?? row.agentId ?? row.id;
  if (!id) throw new Error('agent_id mancante nella risposta ElevenLabs');
  return String(id);
}

/** Parses list agents response into a stable summary list (single page). */
export function parseConvaiAgentList(raw: unknown): ConvaiAgentSummary[] {
  return parseConvaiAgentListPage(raw).agents;
}

function parseKbList(raw: unknown): ConvaiKbDocumentSummary[] {
  const rows = Array.isArray(raw)
    ? raw
    : (typeof raw === 'object' && raw != null && Array.isArray((raw as { documents?: unknown }).documents))
      ? (raw as { documents: unknown[] }).documents
      : [];

  return rows
    .filter((row): row is Record<string, unknown> => typeof row === 'object' && row != null)
    .map((row) => ({
      id: String(row.id ?? row.document_id ?? '').trim(),
      name: String(row.name ?? '').trim(),
    }))
    .filter((row) => row.id.length > 0);
}

/** Lists all non-archived agents (paginated), sorted for designer picker. */
export async function listConvaiAgents(options?: { search?: string }): Promise<ConvaiAgentSummary[]> {
  const collected: ConvaiAgentSummary[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < 20; page += 1) {
    const params = new URLSearchParams({
      page_size: '100',
      archived: 'false',
      sort_direction: 'desc',
      sort_by: 'created_at',
    });
    if (cursor) params.set('cursor', cursor);
    if (options?.search?.trim()) params.set('search', options.search.trim());

    const res = await fetch(`${gatewayBase()}/elevenlabs/agents?${params.toString()}`);
    const raw = await parseJsonResponse<unknown>(res, 'listAgents');
    const pageResult = parseConvaiAgentListPage(raw);
    collected.push(...pageResult.agents);

    if (!pageResult.hasMore || !pageResult.nextCursor) break;
    cursor = pageResult.nextCursor;
  }

  const sorted = sortAgentsForDesignerPicker(collected.filter((a) => !a.archived));
  return options?.search?.trim()
    ? filterConvaiAgentsBySearch(sorted, options.search)
    : sorted;
}

export async function getConvaiAgentDetail(agentId: string): Promise<ConvaiAgentDetail> {
  const res = await fetch(`${gatewayBase()}/elevenlabs/agents/${encodeURIComponent(agentId)}`);
  const raw = await parseJsonResponse<Record<string, unknown>>(res, 'getAgent');
  return {
    agentId: pickAgentId(raw),
    name: String(raw.name ?? '').trim(),
    conversationConfig: raw.conversation_config ?? raw.conversationConfig ?? null,
  };
}

export async function createConvaiAgent(payload: {
  name: string;
  conversation_config: unknown;
}): Promise<{ agentId: string; raw: CreateAgentResponse }> {
  const res = await fetch(`${gatewayBase()}/elevenlabs/createAgent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const raw = await parseJsonResponse<CreateAgentResponse>(res, 'createAgent');
  const agentId = raw.agent_id ?? raw.agentId;
  if (!agentId) throw new Error('createAgent: agent_id mancante nella risposta');
  return { agentId: String(agentId), raw };
}

export async function patchConvaiAgent(
  agentId: string,
  payload: { name?: string; conversation_config?: unknown },
): Promise<CreateAgentResponse> {
  const res = await fetch(`${gatewayBase()}/elevenlabs/agents/${encodeURIComponent(agentId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse<CreateAgentResponse>(res, 'patchAgent');
}

export async function createConvaiKbTextDocument(payload: {
  name: string;
  text: string;
}): Promise<string> {
  const res = await fetch(`${gatewayBase()}/elevenlabs/knowledge-base/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const raw = await parseJsonResponse<Record<string, unknown>>(res, 'createKbText');
  const id = raw.id ?? raw.document_id ?? raw.documentId;
  if (!id) throw new Error('createKbText: id documento mancante');
  return String(id);
}

export async function patchConvaiKbDocument(
  docId: string,
  payload: { name?: string; text: string },
): Promise<void> {
  const res = await fetch(`${gatewayBase()}/elevenlabs/knowledge-base/${encodeURIComponent(docId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await parseJsonResponse<unknown>(res, 'patchKb');
}

export async function deleteConvaiKbDocument(
  docId: string,
  options?: { force?: boolean },
): Promise<void> {
  const force = options?.force ? '?force=true' : '';
  const res = await fetch(
    `${gatewayBase()}/elevenlabs/knowledge-base/${encodeURIComponent(docId)}${force}`,
    { method: 'DELETE' },
  );
  await parseJsonResponse<unknown>(res, 'deleteKb');
}

export async function listConvaiKbDocuments(): Promise<ConvaiKbDocumentSummary[]> {
  const res = await fetch(`${gatewayBase()}/elevenlabs/knowledge-base`);
  const raw = await parseJsonResponse<unknown>(res, 'listKb');
  return parseKbList(raw);
}

function pickToolId(raw: Record<string, unknown>): string {
  const id = raw.id ?? raw.tool_id;
  if (!id) throw new Error('tool_id mancante nella risposta ElevenLabs');
  return String(id);
}

/** Lists workspace-level ConvAI tools. */
export async function listConvaiWorkspaceTools(): Promise<ConvaiWorkspaceToolSummary[]> {
  const res = await fetch(`${gatewayBase()}/elevenlabs/tools?search=agent_dialog_step&page_size=100`);
  const raw = await parseJsonResponse<unknown>(res, 'listTools');
  return parseConvaiWorkspaceToolList(raw);
}

/** Fetches one workspace tool by id (no list endpoint required). */
export async function getConvaiWorkspaceTool(
  toolId: string,
): Promise<ConvaiWorkspaceToolSummary | null> {
  const trimmed = toolId.trim();
  if (!trimmed) return null;
  const res = await fetch(`${gatewayBase()}/elevenlabs/tools/${encodeURIComponent(trimmed)}`);
  const raw = await parseJsonResponse<unknown>(res, 'getTool');
  const parsed = parseConvaiWorkspaceToolList({ tools: [raw] });
  return parsed[0] ?? null;
}

/** Creates a workspace webhook tool (single persistent agent_dialog_step). */
export async function createConvaiWorkspaceTool(
  toolConfig: AgentDialogStepToolConfig,
): Promise<string> {
  const res = await fetch(`${gatewayBase()}/elevenlabs/tools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool_config: toolConfig }),
  });
  const raw = await parseJsonResponse<Record<string, unknown>>(res, 'createTool');
  return pickToolId(raw);
}

/** Updates an existing workspace tool in place (new ngrok URL, same tool id). */
export async function patchConvaiWorkspaceTool(
  toolId: string,
  toolConfig: AgentDialogStepToolConfig,
): Promise<void> {
  const res = await fetch(`${gatewayBase()}/elevenlabs/tools/${encodeURIComponent(toolId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool_config: toolConfig }),
  });
  await parseJsonResponse<unknown>(res, 'patchTool');
}
