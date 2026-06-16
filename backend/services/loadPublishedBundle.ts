/**
 * Loads the latest published agent bundle for a document from Supabase.
 */
import type { AgentBundle } from '../../src/lib/agentBundleTypes';
import { supabase } from './supabaseClient';

/** Returns the newest published bundle snapshot, or null if none exists. */
export async function loadPublishedAgentBundle(
  documentId: string,
): Promise<AgentBundle | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('kb_agent_bundles')
    .select('bundle')
    .eq('document_id', documentId)
    .eq('mode', 'published')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data?.bundle as AgentBundle | undefined) ?? null;
}
