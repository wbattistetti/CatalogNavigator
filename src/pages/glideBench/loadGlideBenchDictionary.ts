/**
 * Loads dictionary refs for the Glide benchmark (Supabase Farmaci, else CSV fallback tokens).
 */
import { loadSavedCategories } from '../../lib/dictionaryTree';
import type { TokenCategory } from '../../lib/dictionaryTree';
import type { KbDictionary } from '../../lib/dictionaryLibrary';
import { buildLoadedRefs, type LoadedDictionaryRef } from '../../lib/multiDictionarySegment';
import type { ParsedTabular } from '../../lib/parseTabular';
import { supabase } from '../../lib/supabase';
import type { TokenEntry } from '../../lib/tokenDictionary';
import { buildFallbackTokensFromCsv } from './buildGlideBenchRows';

const FALLBACK_CATEGORY: TokenCategory = {
  id: 'bench_pharma',
  name: 'Principio attivo',
  type: 'attributo',
  order: 0,
  iconKey: 'Pill',
  iconColor: '#34d399',
  tokenTexts: [],
};

function rowToDictionary(row: Record<string, unknown>): KbDictionary {
  return {
    id: String(row.id),
    name: String(row.name),
    industry: String(row.industry ?? 'healthcare'),
    industry_custom: row.industry_custom != null ? String(row.industry_custom) : null,
    description: row.description != null ? String(row.description) : null,
    scope: row.scope as KbDictionary['scope'],
    project_id: row.project_id != null ? String(row.project_id) : null,
    icon_key: String(row.icon_key ?? 'Pill'),
    icon_color: String(row.icon_color ?? '#34d399'),
    categories: loadSavedCategories({
      categories: Array.isArray(row.categories) ? (row.categories as TokenCategory[]) : [],
    }),
    tokens: Array.isArray(row.tokens) ? (row.tokens as TokenEntry[]) : [],
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  };
}

export interface GlideBenchDictionaryLoad {
  loadedRefs: LoadedDictionaryRef[];
  fallbackTokens: TokenEntry[];
  fallbackCategories: TokenCategory[];
  label: string;
}

const DICTIONARY_QUERY_TIMEOUT_MS = 8_000;

async function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error('timeout')), ms);
    }),
  ]);
}

/** Loads Farmaci from Supabase; falls back to principio_attivo tokens from the CSV. */
export async function loadGlideBenchDictionary(tabular: ParsedTabular): Promise<GlideBenchDictionaryLoad> {
  const fallbackTokens = buildFallbackTokensFromCsv(tabular);
  const fallbackCategories = [FALLBACK_CATEGORY];

  try {
    const { data, error } = await withTimeout(
      supabase
        .from('kb_dictionaries')
        .select('*')
        .eq('name', 'Farmaci')
        .eq('scope', 'library')
        .limit(1)
        .maybeSingle(),
      DICTIONARY_QUERY_TIMEOUT_MS,
    );

    if (error || !data) throw error ?? new Error('Farmaci non trovato');

    const dict = rowToDictionary(data as Record<string, unknown>);
    if (dict.tokens.length === 0) throw new Error('Dizionario Farmaci senza token');

    return {
      loadedRefs: buildLoadedRefs([], [{ dictionary: dict, sortOrder: 0 }]),
      fallbackTokens,
      fallbackCategories: dict.categories.length > 0 ? dict.categories : fallbackCategories,
      label: `Farmaci (${dict.tokens.length.toLocaleString('it-IT')} token)`,
    };
  } catch {
    return {
      loadedRefs: [],
      fallbackTokens,
      fallbackCategories,
      label: fallbackTokens.length > 0
        ? `fallback principio_attivo (${fallbackTokens.length.toLocaleString('it-IT')} token)`
        : 'nessun dizionario',
    };
  }
}
