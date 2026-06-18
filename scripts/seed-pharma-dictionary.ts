/**
 * Inserts an empty pharmaceutical library dictionary (categories only, no tokens).
 * Idempotent: creates the dict if missing; always refreshes category icons when present.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolveCategoryIcon } from '../src/lib/categoryIconCatalog';
import type { TokenCategory } from '../src/lib/dictionaryTree';

config({ path: '.env' });

const LOCAL_URL = 'http://127.0.0.1:54321';
const LOCAL_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const DICTIONARY_NAME = 'Farmaci';

const CATEGORY_DEFS: Array<{ name: string; type?: 'attributo' | 'vincolo' }> = [
  { name: 'Principio attivo' },
  { name: 'Nome commerciale' },
  { name: 'Classe terapeutica' },
  { name: 'Forma farmaceutica' },
  { name: 'Forma di confezionamento' },
  { name: 'Dosaggio / concentrazione' },
  { name: 'Quantità confezione' },
  { name: 'Indicazione clinica' },
  { name: 'Vincoli / controindicazioni', type: 'vincolo' },
  { name: 'Modalità di somministrazione' },
  { name: 'Regime di prescrizione' },
  { name: 'Target paziente / fascia di età' },
  { name: 'Indicazioni regolatorie' },
  { name: 'Stabilità e conservazione' },
  { name: 'Via di eliminazione / metabolismo' },
  { name: 'Interazioni farmacologiche rilevanti' },
];

function newCategoryId(): string {
  return `cat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function iconForCategoryName(name: string): { iconKey: string; iconColor: string } {
  const icon = resolveCategoryIcon(name);
  return { iconKey: icon.iconKey, iconColor: icon.iconColor };
}

function buildCategories(): TokenCategory[] {
  return CATEGORY_DEFS.map((def, order) => {
    const icon = iconForCategoryName(def.name);
    return {
      id: newCategoryId(),
      name: def.name,
      order,
      type: def.type ?? 'attributo',
      iconKey: icon.iconKey,
      iconColor: icon.iconColor,
      tokenTexts: [],
    };
  });
}

function refreshCategoryIcons(existing: TokenCategory[]): TokenCategory[] {
  return existing.map((cat) => {
    const icon = iconForCategoryName(cat.name);
    return { ...cat, iconKey: icon.iconKey, iconColor: icon.iconColor };
  });
}

async function main() {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim() ||
    LOCAL_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
    LOCAL_ANON;

  const supabase = createClient(url, key);

  const { data: existing, error: lookupError } = await supabase
    .from('kb_dictionaries')
    .select('*')
    .eq('scope', 'library')
    .eq('name', DICTIONARY_NAME)
    .maybeSingle();

  if (lookupError) {
    console.error('Lookup fallito:', lookupError.message);
    process.exit(1);
  }

  if (existing) {
    const categories = refreshCategoryIcons(
      Array.isArray(existing.categories) ? (existing.categories as TokenCategory[]) : [],
    );
    const { error } = await supabase
      .from('kb_dictionaries')
      .update({ categories, updated_at: new Date().toISOString() })
      .eq('id', existing.id);

    if (error) {
      console.error('Aggiornamento icone fallito:', error.message);
      process.exit(1);
    }

    console.log(`Icone aggiornate per "${DICTIONARY_NAME}" (id: ${existing.id}).`);
    categories.forEach((c) => {
      const badge = c.type === 'vincolo' ? ' [vincolo]' : '';
      console.log(`  ${c.order + 1}. ${c.iconKey} ${c.name}${badge}`);
    });
    return;
  }

  const categories = buildCategories();
  const row = {
    name: DICTIONARY_NAME,
    industry: 'other',
    industry_custom: 'Farmaceutica',
    description: 'Dizionario farmaceutico — categorie predefinite, token da popolare.',
    scope: 'library',
    project_id: null,
    icon_key: 'Pill',
    icon_color: '#c084fc',
    categories,
    tokens: [],
  };

  const { data, error } = await supabase.from('kb_dictionaries').insert(row).select('id, name').single();

  if (error) {
    console.error('Inserimento fallito:', error.message);
    process.exit(1);
  }

  console.log(`Dizionario "${data.name}" creato in libreria (id: ${data.id}).`);
  console.log(`Categorie: ${categories.length} (vuote, senza token).`);
  categories.forEach((c) => {
    const badge = c.type === 'vincolo' ? ' [vincolo]' : '';
    console.log(`  ${c.order + 1}. ${c.iconKey} ${c.name}${badge}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
