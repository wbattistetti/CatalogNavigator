/**
 * Refactors the Farmaci dictionary from extract checkpoint and writes to Supabase.
 *
 * Usage:
 *   npx tsx scripts/refactor-pharma-dictionary.ts
 *   npx tsx scripts/refactor-pharma-dictionary.ts --dry-run
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { syncCategoriesWithTokens, type TokenCategory } from '../src/lib/dictionaryTree';
import { resolveCategoryIcon } from '../src/lib/categoryIconCatalog';
import type { TokenEntry } from '../src/lib/tokenDictionary';
import {
  PHARMA_CATEGORY_NAMES,
  PHARMA_DICTIONARY_NAME,
  isPharmaVincoloCategory,
  type PharmaCategoryName,
} from './lib/pharmaDictionaryCategories';
import {
  rebuildByCategory,
  refactorTokenCategoryMap,
  splitCanonicalAndAliases,
} from './lib/pharmaRefactor/refactorCheckpoint';
import { dedupeTokens } from './lib/pharmaRefactor/normalize';

config({ path: '.env' });

const LOCAL_URL = 'http://127.0.0.1:54321';
const LOCAL_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const CHECKPOINT_PATH = join(process.cwd(), 'backups', 'pharma-csv-extract-checkpoint.json');
const REFACTOR_REPORT_PATH = join(process.cwd(), 'backups', 'pharma-refactor-report.json');
const REFACTOR_CHECKPOINT_PATH = join(process.cwd(), 'backups', 'pharma-refactor-checkpoint.json');

interface ExtractCheckpoint {
  tokenCategory: Record<string, string>;
  csvPath?: string;
  processedRows?: number;
  totalRows?: number;
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

function buildCategoriesFromRefactor(
  existingCategories: TokenCategory[],
  byCategory: Record<string, string[]>,
): TokenCategory[] {
  const byName = new Map(existingCategories.map((c) => [c.name, c]));

  return PHARMA_CATEGORY_NAMES.map((name, order) => {
    const prev = byName.get(name);
    const icon = resolveCategoryIcon(name);
    const type = isPharmaVincoloCategory(name) ? 'vincolo' : 'attributo';
    return {
      id: prev?.id ?? `cat_pharma_${order}_${name.replace(/\W+/g, '_').slice(0, 24)}`,
      name,
      order,
      type,
      iconKey: prev?.iconKey ?? icon.iconKey,
      iconColor: prev?.iconColor ?? icon.iconColor,
      tokenTexts: dedupeTokens(byCategory[name] ?? []),
    };
  });
}

async function writeDictionaryToSupabase(
  tokenCategory: Record<string, PharmaCategoryName>,
  aliasEntries: Array<{ text: string; aliasOf: string }>,
  meta: { processedRows?: number; totalRows?: number },
): Promise<string> {
  const supabase = getSupabase();
  const { data: existing, error: lookupError } = await supabase
    .from('kb_dictionaries')
    .select('*')
    .eq('scope', 'library')
    .eq('name', PHARMA_DICTIONARY_NAME)
    .maybeSingle();

  if (lookupError) throw new Error(lookupError.message);

  const prevCategories = Array.isArray(existing?.categories)
    ? (existing.categories as TokenCategory[])
    : [];

  const byCategory = rebuildByCategory(tokenCategory);
  const byCategoryPlain = Object.fromEntries(
    PHARMA_CATEGORY_NAMES.map((n) => [n, byCategory[n] ?? []]),
  );

  const categories = buildCategoriesFromRefactor(prevCategories, byCategoryPlain);
  const canonicalTexts = dedupeTokens(Object.keys(tokenCategory));
  const tokens: TokenEntry[] = canonicalTexts.map((text) => ({ text, enabled: true }));

  for (const alias of aliasEntries) {
    if (tokens.some((t) => t.text === alias.text)) continue;
    tokens.push({ text: alias.text, enabled: true, aliasOf: alias.aliasOf });
  }

  const syncedCategories = syncCategoriesWithTokens(categories, tokens);

  const payload = {
    categories: syncedCategories,
    tokens,
    updated_at: new Date().toISOString(),
    description: `Dizionario farmaceutico veterinario — refactor atomico (${meta.processedRows ?? '?'}/${meta.totalRows ?? '?'} righe CSV origine).`,
  };

  if (existing) {
    const { error } = await supabase.from('kb_dictionaries').update(payload).eq('id', existing.id);
    if (error) throw new Error(error.message);
    return existing.id as string;
  }

  const { data, error } = await supabase
    .from('kb_dictionaries')
    .insert({
      name: PHARMA_DICTIONARY_NAME,
      industry: 'other',
      industry_custom: 'Farmaceutica',
      scope: 'library',
      project_id: null,
      icon_key: 'Pill',
      icon_color: '#c084fc',
      ...payload,
    })
    .select('id')
    .single();

  if (error || !data) throw new Error(error?.message ?? 'Inserimento dizionario fallito');
  return data.id as string;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const raw = readFileSync(CHECKPOINT_PATH, 'utf8');
  const extractCp = JSON.parse(raw) as ExtractCheckpoint;
  if (!extractCp.tokenCategory || Object.keys(extractCp.tokenCategory).length === 0) {
    throw new Error(`Checkpoint vuoto o invalido: ${CHECKPOINT_PATH}`);
  }

  const refactor = refactorTokenCategoryMap(extractCp.tokenCategory);
  const { canonicalTexts, aliasEntries } = splitCanonicalAndAliases(
    refactor.tokenCategory,
    refactor.aliases,
  );

  const tokenCategoryOut: Record<string, PharmaCategoryName> = {};
  for (const text of canonicalTexts) {
    tokenCategoryOut[text] = refactor.tokenCategory[text]!;
  }

  const byCategory = rebuildByCategory(refactor.tokenCategory);
  const report = {
    generatedAt: new Date().toISOString(),
    dryRun,
    sourceCheckpoint: CHECKPOINT_PATH,
    stats: refactor.stats,
    aliasCount: aliasEntries.length,
    categories: PHARMA_CATEGORY_NAMES.map((name) => ({
      category: name,
      count: byCategory[name]?.length ?? 0,
      samples: (byCategory[name] ?? []).slice(0, 6),
    })),
  };

  mkdirSync(join(process.cwd(), 'backups'), { recursive: true });
  writeFileSync(REFACTOR_REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

  const refactorCp = {
    ...extractCp,
    tokenCategory: tokenCategoryOut,
    byCategory: Object.fromEntries(PHARMA_CATEGORY_NAMES.map((n) => [n, byCategory[n] ?? []])),
    refactoredAt: new Date().toISOString(),
    refactorStats: refactor.stats,
  };
  writeFileSync(REFACTOR_CHECKPOINT_PATH, JSON.stringify(refactorCp, null, 2), 'utf8');

  console.log('=== Refactor dizionario Farmaci ===');
  console.log(`Input token:  ${refactor.stats.inputTokens}`);
  console.log(`Output token: ${refactor.stats.outputCanonicalTokens} (+ ${aliasEntries.length} alias)`);
  console.log(`Decomposti:   ${refactor.stats.decomposedCount}`);
  console.log(`\nReport: ${REFACTOR_REPORT_PATH}`);
  for (const row of report.categories) {
    console.log(`  ${row.category}: ${row.count}`);
  }

  if (dryRun) {
    console.log('\n--dry-run: nessuna scrittura su Supabase.');
    return;
  }

  const dictId = await writeDictionaryToSupabase(tokenCategoryOut, aliasEntries, {
    processedRows: extractCp.processedRows,
    totalRows: extractCp.totalRows,
  });
  console.log(`\nDizionario "${PHARMA_DICTIONARY_NAME}" aggiornato (id: ${dictId}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
