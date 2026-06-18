/**
 * Populates the Farmaci library dictionary from a veterinary medicines CSV via batched OpenAI extraction.
 *
 * Usage:
 *   npx tsx scripts/populate-pharma-from-csv.ts "C:\path\to\FRM_VET.csv"
 *   npx tsx scripts/populate-pharma-from-csv.ts --resume
 *   npx tsx scripts/populate-pharma-from-csv.ts --max-batches 3   # smoke test
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { syncCategoriesWithTokens, type TokenCategory } from '../src/lib/dictionaryTree';
import { resolveCategoryIcon } from '../src/lib/categoryIconCatalog';
import type { TokenEntry } from '../src/lib/tokenDictionary';
import { extractPharmaBatchResilient } from './lib/pharmaAiExtract';
import {
  PHARMA_CATEGORY_NAMES,
  PHARMA_DICTIONARY_NAME,
  PHARMA_VINCOLO_CATEGORY,
  type PharmaCategoryName,
} from './lib/pharmaDictionaryCategories';
import { readPharmaCsv } from './lib/pharmaCsvParse';

config({ path: '.env' });

const LOCAL_URL = 'http://127.0.0.1:54321';
const LOCAL_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const BATCH_SIZE = 40;
const CHECKPOINT_PATH = join(process.cwd(), 'backups', 'pharma-csv-extract-checkpoint.json');
const REPORT_PATH = join(process.cwd(), 'backups', 'pharma-csv-extract-report.json');

interface Checkpoint {
  csvPath: string;
  totalRows: number;
  /** Row offset for next batch (0-based, excludes header). */
  nextRowIndex: number;
  batchSize: number;
  /** @deprecated legacy — migrated to nextRowIndex */
  nextBatchIndex?: number;
  /** category → token texts */
  byCategory: Record<string, string[]>;
  /** token → category (first assignment wins on conflict) */
  tokenCategory: Record<string, PharmaCategoryName>;
  conflicts: Array<{ text: string; existing: PharmaCategoryName; incoming: PharmaCategoryName; batch: number }>;
  ambiguousLog: Array<{ text: string; chosen: PharmaCategoryName; candidates: PharmaCategoryName[]; batch: number }>;
  processedRows: number;
  updatedAt: string;
}

function normalizeKey(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

function dedupeTokens(tokens: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens) {
    const key = normalizeKey(t);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(t.trim().replace(/\s+/g, ' '));
  }
  return out.sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));
}

function emptyByCategory(): Record<PharmaCategoryName, string[]> {
  return Object.fromEntries(PHARMA_CATEGORY_NAMES.map((c) => [c, []])) as Record<
    PharmaCategoryName,
    string[]
  >;
}

function rebuildByCategory(tokenCategory: Record<string, PharmaCategoryName>): Record<string, string[]> {
  const byCategory = emptyByCategory();
  for (const [text, category] of Object.entries(tokenCategory)) {
    byCategory[category].push(text);
  }
  for (const cat of PHARMA_CATEGORY_NAMES) {
    byCategory[cat] = dedupeTokens(byCategory[cat]);
  }
  return byCategory;
}

function migrateCheckpoint(cp: Checkpoint): Checkpoint {
  if (cp.nextRowIndex == null && cp.nextBatchIndex != null) {
    cp.nextRowIndex = cp.nextBatchIndex * (cp.batchSize || BATCH_SIZE);
    delete cp.nextBatchIndex;
  }
  if (cp.nextRowIndex == null) cp.nextRowIndex = 0;
  cp.batchSize = BATCH_SIZE;
  return cp;
}

function loadCheckpoint(): Checkpoint | null {
  try {
    const raw = readFileSync(CHECKPOINT_PATH, 'utf8');
    return migrateCheckpoint(JSON.parse(raw) as Checkpoint);
  } catch {
    return null;
  }
}

function saveCheckpoint(cp: Checkpoint): void {
  mkdirSync(join(process.cwd(), 'backups'), { recursive: true });
  cp.updatedAt = new Date().toISOString();
  cp.byCategory = rebuildByCategory(cp.tokenCategory);
  writeFileSync(CHECKPOINT_PATH, JSON.stringify(cp, null, 2), 'utf8');
}

function mergeBatchIntoCheckpoint(
  cp: Checkpoint,
  batchIndex: number,
  tokens: Array<{ text: string; category: PharmaCategoryName }>,
  ambiguous: Array<{ text: string; chosen: PharmaCategoryName; candidates: PharmaCategoryName[] }>,
): void {
  for (const { text, category } of tokens) {
    const key = normalizeKey(text);
    if (!key) continue;
    const existing = Object.entries(cp.tokenCategory).find(([t]) => normalizeKey(t) === key);
    if (existing) {
      const [, existingCat] = existing;
      if (existingCat !== category) {
        cp.conflicts.push({
          text,
          existing: existingCat,
          incoming: category,
          batch: batchIndex,
        });
      }
      continue;
    }
    cp.tokenCategory[text] = category;
  }

  for (const a of ambiguous) {
    cp.ambiguousLog.push({ ...a, batch: batchIndex });
  }
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

function buildCategoriesFromCheckpoint(
  existingCategories: TokenCategory[],
  byCategory: Record<string, string[]>,
): TokenCategory[] {
  const byName = new Map(existingCategories.map((c) => [c.name, c]));

  return PHARMA_CATEGORY_NAMES.map((name, order) => {
    const prev = byName.get(name);
    const icon = resolveCategoryIcon(name);
    const type = name === PHARMA_VINCOLO_CATEGORY ? 'vincolo' : 'attributo';
    return {
      id: prev?.id ?? `cat_pharma_${order}_${name.replace(/\W+/g, '_').slice(0, 20)}`,
      name,
      order,
      type,
      iconKey: prev?.iconKey ?? icon.iconKey,
      iconColor: prev?.iconColor ?? icon.iconColor,
      tokenTexts: dedupeTokens(byCategory[name] ?? []),
    };
  });
}

async function writeDictionaryToSupabase(cp: Checkpoint): Promise<string> {
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

  const categories = buildCategoriesFromCheckpoint(prevCategories, cp.byCategory);
  const tokenTexts = dedupeTokens(Object.keys(cp.tokenCategory));
  const tokens: TokenEntry[] = tokenTexts.map((text) => ({ text, enabled: true }));
  const syncedCategories = syncCategoriesWithTokens(categories, tokens);

  const payload = {
    categories: syncedCategories,
    tokens,
    updated_at: new Date().toISOString(),
    description: `Dizionario farmaceutico veterinario — estratto da CSV (${cp.processedRows}/${cp.totalRows} righe processate).`,
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

function writeReport(cp: Checkpoint, dictId: string): void {
  const summary = PHARMA_CATEGORY_NAMES.map((name) => ({
    category: name,
    count: (cp.byCategory[name] ?? []).length,
    samples: (cp.byCategory[name] ?? []).slice(0, 8),
  }));

  const report = {
    generatedAt: new Date().toISOString(),
    dictionaryId: dictId,
    dictionaryName: PHARMA_DICTIONARY_NAME,
    csvPath: cp.csvPath,
    totalRows: cp.totalRows,
    processedRows: cp.processedRows,
    uniqueTokens: Object.keys(cp.tokenCategory).length,
    batchesCompleted: Math.ceil(cp.nextRowIndex / cp.batchSize),
    conflicts: cp.conflicts.slice(0, 100),
    conflictCount: cp.conflicts.length,
    ambiguousCount: cp.ambiguousLog.length,
    categories: summary,
  };

  mkdirSync(join(process.cwd(), 'backups'), { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\nReport: ${REPORT_PATH}`);
  console.log(`Token unici: ${report.uniqueTokens}`);
  for (const row of summary) {
    console.log(`  ${row.category}: ${row.count}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const resume = args.includes('--resume');
  const maxBatchesArg = args.find((a) => a.startsWith('--max-batches='));
  const maxBatches = maxBatchesArg ? Number(maxBatchesArg.split('=')[1]) : Infinity;
  const csvArg = args.find((a) => !a.startsWith('--'));

  let cp: Checkpoint | null = resume ? loadCheckpoint() : null;

  if (!cp) {
    if (!csvArg) {
      console.error('Usage: npx tsx scripts/populate-pharma-from-csv.ts <path-to-csv> [--max-batches=N]');
      console.error('       npx tsx scripts/populate-pharma-from-csv.ts --resume');
      process.exit(1);
    }
    const rows = readPharmaCsv(csvArg);
    cp = {
      csvPath: csvArg,
      totalRows: rows.length,
      nextRowIndex: 0,
      batchSize: BATCH_SIZE,
      byCategory: emptyByCategory(),
      tokenCategory: {},
      conflicts: [],
      ambiguousLog: [],
      processedRows: 0,
      updatedAt: new Date().toISOString(),
    };
    console.log(`CSV: ${rows.length} righe, batch size ${BATCH_SIZE}`);
  } else {
    console.log(`Ripresa da riga ${cp.nextRowIndex + 1} (${cp.processedRows}/${cp.totalRows} righe)`);
  }

  const allRows = readPharmaCsv(cp.csvPath);
  let batchesDoneThisRun = 0;
  let batchRetries = 0;
  const MAX_BATCH_RETRIES = 5;

  while (cp.nextRowIndex < allRows.length && batchesDoneThisRun < maxBatches) {
    const start = cp.nextRowIndex;
    const batch = allRows.slice(start, start + BATCH_SIZE);
    if (batch.length === 0) break;

    const batchNum = Math.floor(start / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(allRows.length / BATCH_SIZE);

    console.log(
      `\n[batch ${batchNum}/${totalBatches}] righe ${start + 1}-${start + batch.length}…`,
    );

    try {
      const { tokens, ambiguous } = await extractPharmaBatchResilient(batch);
      mergeBatchIntoCheckpoint(cp, batchNum, tokens, ambiguous);
      saveCheckpoint(cp);

      await writeDictionaryToSupabase(cp);

      cp.nextRowIndex = start + batch.length;
      cp.processedRows = cp.nextRowIndex;
      batchesDoneThisRun += 1;
      saveCheckpoint(cp);

      console.log(
        `  +${tokens.length} token estratti, totale unici: ${Object.keys(cp.tokenCategory).length}`,
      );
      batchRetries = 0;
    } catch (err) {
      saveCheckpoint(cp);
      batchRetries += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  Batch righe ${start + 1}-${start + batch.length} fallito (${batchRetries}/${MAX_BATCH_RETRIES}): ${msg}`);
      if (batchRetries >= MAX_BATCH_RETRIES) {
        console.error('  Troppi tentativi sullo stesso batch — interruzione.');
        process.exit(1);
      }
      console.error('  Checkpoint salvato — riprovo lo stesso batch tra 5s…');
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  const dictId = await writeDictionaryToSupabase(cp);
  writeReport(cp, dictId);
  console.log(`\nDizionario "${PHARMA_DICTIONARY_NAME}" aggiornato (id: ${dictId}).`);

  if (cp.nextRowIndex < allRows.length) {
    const remaining = Math.ceil((allRows.length - cp.nextRowIndex) / BATCH_SIZE);
    console.log(
      `\nRimanenti ~${remaining} batch. Esegui: npx tsx scripts/populate-pharma-from-csv.ts --resume`,
    );
  } else {
    console.log('\nEstrazione completata su tutto il documento.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
