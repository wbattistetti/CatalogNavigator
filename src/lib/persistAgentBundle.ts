/**
 * Persists compiled agent bundles to Supabase for published runtime deploy.
 */
import type { AgentBundle } from './agentBundleTypes';
import { supabase } from './supabase';

export interface PublishedAgentBundleRow {
  id: string;
  document_id: string;
  mode: 'published' | 'preview';
  bundle: AgentBundle;
  created_at: string;
}

/** Saves a published bundle snapshot (replaces prior published row for the document). */
export async function publishAgentBundle(
  documentId: string,
  bundle: AgentBundle,
): Promise<PublishedAgentBundleRow> {
  await supabase
    .from('kb_agent_bundles')
    .delete()
    .eq('document_id', documentId)
    .eq('mode', 'published');

  const payload = {
    ...bundle,
    meta: { ...bundle.meta, documentId, mode: 'published' as const },
  };

  const { data, error } = await supabase
    .from('kb_agent_bundles')
    .insert({
      document_id: documentId,
      mode: 'published',
      bundle: payload,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as PublishedAgentBundleRow;
}

/** Loads the latest published bundle for a document. */
export async function loadPublishedAgentBundle(
  documentId: string,
): Promise<AgentBundle | null> {
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
