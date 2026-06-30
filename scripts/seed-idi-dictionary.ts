/**
 * Seeds the IDI call-center dictionary into the shared library (industry label: IDI).
 * Idempotent: creates or fully refreshes categories and tokens from scripts/data/idi-dictionary.json.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolveCategoryIcon } from '../src/lib/categoryIconCatalog';
import { syncCategoriesWithTokens, type TokenCategory } from '../src/lib/dictionaryTree';
import type { TokenEntry } from '../src/lib/tokenDictionary';

config({ path: '.env' });

const LOCAL_URL = 'http://127.0.0.1:54321';
const LOCAL_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const DICTIONARY_NAME = 'IDI';
const INDUSTRY_CUSTOM = 'IDI';
const DATA_PATH = join(process.cwd(), 'scripts', 'data', 'idi-dictionary.json');

interface DictionaryPayload {
  categories: TokenCategory[];
  tokens: TokenEntry[];
}

function loadPayload(): DictionaryPayload {
  const raw = readFileSync(DATA_PATH, 'utf8');
  const parsed = JSON.parse(raw) as DictionaryPayload;
  if (!Array.isArray(parsed.categories) || !Array.isArray(parsed.tokens)) {
    throw new Error('idi-dictionary.json: categories e tokens obbligatori');
  }
  return parsed;
}

function enrichCategories(categories: TokenCategory[]): TokenCategory[] {
  return categories.map((cat) => {
    const icon = resolveCategoryIcon(cat.name);
    return {
      ...cat,
      iconKey: cat.iconKey ?? icon.iconKey,
      iconColor: cat.iconColor ?? icon.iconColor,
    };
  });
}

function getSupabase() {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim() ||
    LOCAL_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
    LOCAL_ANON;
  return createClient(url, key);
}

async function main() {
  const { categories: rawCategories, tokens } = loadPayload();
  const categories = syncCategoriesWithTokens(enrichCategories(rawCategories), tokens);
  const supabase = getSupabase();

  const { data: existing, error: lookupError } = await supabase
    .from('kb_dictionaries')
    .select('id')
    .eq('scope', 'library')
    .eq('name', DICTIONARY_NAME)
    .maybeSingle();

  if (lookupError) {
    console.error('Lookup fallito:', lookupError.message);
    process.exit(1);
  }

  const payload = {
    categories,
    tokens,
    industry: 'other',
    industry_custom: INDUSTRY_CUSTOM,
    description: 'Dizionario call center IDI — azioni, prestazioni, reparti e luoghi.',
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { data, error } = await supabase
      .from('kb_dictionaries')
      .update(payload)
      .eq('id', existing.id)
      .select('id, name, industry, industry_custom')
      .single();

    if (error) {
      console.error('Aggiornamento fallito:', error.message);
      process.exit(1);
    }

    console.log(`Dizionario "${data.name}" aggiornato (id: ${data.id}, industry: ${data.industry_custom}).`);
    console.log(`  ${categories.length} categorie, ${tokens.length} token`);
    return;
  }

  const { data, error } = await supabase
    .from('kb_dictionaries')
    .insert({
      name: DICTIONARY_NAME,
      scope: 'library',
      project_id: null,
      icon_key: 'Stethoscope',
      icon_color: '#38bdf8',
      ...payload,
    })
    .select('id, name, industry, industry_custom')
    .single();

  if (error) {
    console.error('Inserimento fallito:', error.message);
    process.exit(1);
  }

  console.log(`Dizionario "${data.name}" creato in libreria (id: ${data.id}, industry: ${data.industry_custom}).`);
  console.log(`  ${categories.length} categorie, ${tokens.length} token`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
