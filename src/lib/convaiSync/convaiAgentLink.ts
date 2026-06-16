/**
 * Persists ElevenLabs ConvAI agent link per document (Supabase).
 */
import { supabase } from '../supabase';

export interface ConvaiAgentLink {
  schemaVersion: 1;
  documentId: string;
  agentId: string;
  agentName?: string;
  lastSyncedAt?: string;
  bundleCompiledAt?: string;
  publicBaseUrl?: string | null;
  /** webhook = agent_dialog_step; no-backend = structured KB + LLM algorithm. */
  deployMode?: 'webhook' | 'no-backend';
  kbRemoteByDocId?: Record<string, string>;
  lastKbRemoteIds?: string[];
}

function readLinkJson(data: Record<string, unknown>): Partial<ConvaiAgentLink> {
  const json = data.link_json;
  if (!json || typeof json !== 'object') return {};
  return json as Partial<ConvaiAgentLink>;
}

export async function loadConvaiAgentLink(documentId: string): Promise<ConvaiAgentLink | null> {
  const { data, error } = await supabase
    .from('kb_convai_links')
    .select('*')
    .eq('document_id', documentId)
    .maybeSingle();

  if (error) {
    // Tabella assente o PostgREST non aggiornato — tratta come nessun link salvato.
    if (error.code === 'PGRST205' || error.message.includes('kb_convai_links')) {
      return null;
    }
    throw new Error(error.message);
  }
  if (!data) return null;

  const stored = readLinkJson(data as Record<string, unknown>);

  return {
    schemaVersion: 1,
    documentId: data.document_id,
    agentId: data.agent_id,
    agentName: data.agent_name ?? stored.agentName ?? undefined,
    lastSyncedAt: data.last_synced_at ?? stored.lastSyncedAt ?? undefined,
    bundleCompiledAt: data.bundle_compiled_at ?? stored.bundleCompiledAt ?? undefined,
    publicBaseUrl: data.public_base_url ?? stored.publicBaseUrl ?? null,
    kbRemoteByDocId: stored.kbRemoteByDocId ?? {},
    lastKbRemoteIds: stored.lastKbRemoteIds ?? [],
  };
}

export async function saveConvaiAgentLink(link: ConvaiAgentLink): Promise<void> {
  const { error } = await supabase
    .from('kb_convai_links')
    .upsert({
      document_id: link.documentId,
      agent_id: link.agentId,
      agent_name: link.agentName ?? null,
      last_synced_at: link.lastSyncedAt ?? new Date().toISOString(),
      bundle_compiled_at: link.bundleCompiledAt ?? null,
      public_base_url: link.publicBaseUrl ?? null,
      link_json: link,
    }, { onConflict: 'document_id' });

  if (error) throw new Error(error.message);
}
