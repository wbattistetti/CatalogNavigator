/**
 * Removes kb_projects rows that have no linked kb_documents.
 * Keeps only projects referenced by at least one document.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env' });
config({ path: '.env.local' });

const LOCAL_URL = 'http://127.0.0.1:54321';
const LOCAL_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL ?? LOCAL_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY ?? LOCAL_ANON;
  return createClient(url, key);
}

async function main(): Promise<void> {
  const supabase = getSupabase();

  const { data: documents, error: docErr } = await supabase
    .from('kb_documents')
    .select('id, name, project_id');

  if (docErr) throw new Error(docErr.message);

  const keepProjectIds = new Set(
    (documents ?? [])
      .map((d) => d.project_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  );

  const { data: projects, error: projErr } = await supabase
    .from('kb_projects')
    .select('id, name, created_at')
    .order('created_at', { ascending: false });

  if (projErr) throw new Error(projErr.message);

  const orphans = (projects ?? []).filter((p) => !keepProjectIds.has(p.id));
  const kept = (projects ?? []).filter((p) => keepProjectIds.has(p.id));

  console.log(`Documents: ${documents?.length ?? 0}`);
  console.log(`Projects to keep: ${kept.length}`);
  kept.forEach((p) => console.log(`  keep  ${p.id}  ${p.name}`));
  console.log(`Orphan projects to delete: ${orphans.length}`);

  if (orphans.length === 0) {
    console.log('Nothing to delete.');
    return;
  }

  orphans.forEach((p) => console.log(`  delete  ${p.id}  ${p.name}`));

  const orphanIds = orphans.map((p) => p.id);
  const { error: deleteErr } = await supabase
    .from('kb_projects')
    .delete()
    .in('id', orphanIds);

  if (deleteErr) throw new Error(deleteErr.message);

  const { data: remaining, error: verifyErr } = await supabase
    .from('kb_projects')
    .select('id, name');

  if (verifyErr) throw new Error(verifyErr.message);

  console.log(`\nDone. Remaining projects: ${remaining?.length ?? 0}`);
  remaining?.forEach((p) => console.log(`  ${p.id}  ${p.name}`));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
