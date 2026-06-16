/**
 * Parse, sort and label ElevenLabs ConvAI agents for the designer picker.
 */
import type { ConvaiAgentSummary } from './convaiProvisionApi';

const OMNIA_AUTO_NAME_RE = /^OMNIA_default_project/i;

export interface ConvaiAgentListPage {
  agents: ConvaiAgentSummary[];
  hasMore: boolean;
  nextCursor: string | null;
}

function pickAgentId(row: Record<string, unknown>): string {
  const id = row.agent_id ?? row.agentId ?? row.id;
  if (!id) throw new Error('agent_id mancante nella risposta ElevenLabs');
  return String(id);
}

/** Human-readable label for agents with Omnia auto-generated technical names. */
export function formatConvaiAgentDisplayName(name: string, agentId: string): string {
  const trimmed = name.trim() || 'Senza nome';
  if (OMNIA_AUTO_NAME_RE.test(trimmed)) {
    return `Clone Omnia · …${agentId.slice(-8)}`;
  }
  return trimmed;
}

function parseAgentRow(row: Record<string, unknown>): ConvaiAgentSummary {
  const agentId = pickAgentId(row);
  const name = String(row.name ?? row.agent_name ?? 'Senza nome').trim() || 'Senza nome';
  const last7DayCallCount = Number(row.last_7_day_call_count ?? 0) || 0;
  const archived = Boolean(row.archived);
  return {
    agentId,
    name,
    displayName: formatConvaiAgentDisplayName(name, agentId),
    last7DayCallCount,
    archived,
    isOmniaAutoName: OMNIA_AUTO_NAME_RE.test(name),
  };
}

/** Parses one page from GET /convai/agents. */
export function parseConvaiAgentListPage(raw: unknown): ConvaiAgentListPage {
  const envelope = (typeof raw === 'object' && raw != null) ? raw as Record<string, unknown> : {};
  const rows = Array.isArray(raw)
    ? raw
    : Array.isArray(envelope.agents)
      ? envelope.agents as unknown[]
      : [];

  const agents = rows
    .filter((row): row is Record<string, unknown> => typeof row === 'object' && row != null)
    .map(parseAgentRow);

  return {
    agents,
    hasMore: Boolean(envelope.has_more),
    nextCursor: typeof envelope.next_cursor === 'string' ? envelope.next_cursor : null,
  };
}

/** Sorts like ElevenLabs dashboard: più usati in cima, nomi leggibili prima dei clone Omnia. */
export function sortAgentsForDesignerPicker(agents: ConvaiAgentSummary[]): ConvaiAgentSummary[] {
  return [...agents].sort((a, b) => {
    if (a.archived !== b.archived) return a.archived ? 1 : -1;
    if (b.last7DayCallCount !== a.last7DayCallCount) {
      return b.last7DayCallCount - a.last7DayCallCount;
    }
    if (a.isOmniaAutoName !== b.isOmniaAutoName) return a.isOmniaAutoName ? 1 : -1;
    return a.displayName.localeCompare(b.displayName, 'it', { sensitivity: 'base' });
  });
}

/** Filters agents by search query (name, display name, id). */
export function filterConvaiAgentsBySearch(
  agents: ConvaiAgentSummary[],
  query: string,
): ConvaiAgentSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return agents;
  return agents.filter((agent) => (
    agent.displayName.toLowerCase().includes(q)
    || agent.name.toLowerCase().includes(q)
    || agent.agentId.toLowerCase().includes(q)
  ));
}
