/**
 * Exports all kb_dictionaries rows to backups/ as JSON (safety snapshot before dictionary edits).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env' });

const LOCAL_URL = 'http://127.0.0.1:54321';
const LOCAL_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const url = process.env.SUPABASE_URL?.trim()
  || process.env.VITE_SUPABASE_URL?.trim()
  || LOCAL_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  || process.env.SUPABASE_ANON_KEY?.trim()
  || process.env.VITE_SUPABASE_ANON_KEY?.trim()
  || LOCAL_ANON;

const supabase = createClient(url, key);

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = join(process.cwd(), 'backups');
const outFile = join(outDir, `dictionaries-${stamp}.json`);

async function main() {
  const { data, error } = await supabase.from('kb_dictionaries').select('*').order('name');
  if (error) {
    console.error('Backup fallito:', error.message);
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });
  const payload = {
    exportedAt: new Date().toISOString(),
    supabaseUrl: url,
    count: data?.length ?? 0,
    dictionaries: data ?? [],
  };
  writeFileSync(outFile, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`Backup salvato: ${outFile} (${payload.count} dizionari)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
