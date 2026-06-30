import { createClient } from '@supabase/supabase-js';

/** Standard local Supabase stack (`supabase start`). */
const LOCAL_DEV_SUPABASE_URL = 'http://127.0.0.1:54321';
const LOCAL_DEV_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const envUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

const supabaseUrl = envUrl || LOCAL_DEV_SUPABASE_URL;
const supabaseAnonKey = envKey || LOCAL_DEV_ANON_KEY;

if (!envUrl || !envKey) {
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY non impostate — uso stack locale di default.',
  );
}

if (
  supabaseUrl.includes('127.0.0.1') || supabaseUrl.includes('localhost')
) {
  if (envKey?.startsWith('sb_publishable_')) {
    console.warn(
      '[supabase] VITE_SUPABASE_ANON_KEY sembra una chiave cloud (sb_publishable_*). '
      + 'Per lo stack locale usa la anon key JWT da "supabase status".',
    );
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export function supabaseConfigSummary(): { url: string; keyConfigured: boolean } {
  return { url: supabaseUrl, keyConfigured: Boolean(envKey) };
}

export type ColumnRole = 'selector' | 'data' | 'description' | 'ontology' | 'ignore';

/** Saved token dictionary for deterministic segmentation. */
export interface SavedTokenDictionary {
  descriptionColumn: string;
  categories?: Array<{
    id: string;
    name: string;
    order: number;
    tokenTexts: string[];
  }>;
  tokens?: Array<{
    text: string;
    enabled: boolean;
    suppressedBy?: string;
    aliasOf?: string;
    grammar?: { regex: string; mappings: Record<string, string> } | null;
  }>;
  /** @deprecated legacy n-gram format */
  entries?: Array<{
    text: string;
    n?: 1 | 2 | 3;
    frequency?: number;
    enabled?: boolean;
    manualOverride?: 'on' | 'off' | null;
    suppressedBy?: string;
  }>;
}

export interface KbDocument {
  id: string;
  name: string;
  format: KbFileFormat;
  storage_path: string;
  file_size: number | null;
  column_headers: string[];
  column_roles: Record<string, ColumnRole>;
  project_id?: string | null;
  token_dictionary?: SavedTokenDictionary | null;
  created_at: string;
}

export type ProjectStatus = 'draft' | 'active';

export interface KbProject {
  id: string;
  name: string;
  description: string | null;
  client?: string | null;
  industry?: string | null;
  industry_custom?: string | null;
  version_major?: number;
  version_minor?: number;
  version_qualifier?: string;
  language?: string;
  owner_company?: string | null;
  owner_client?: string | null;
  status?: ProjectStatus;
  created_at: string;
  updated_at: string;
}

export type DictionaryScope = 'library' | 'project';

export interface KbDictionaryRow {
  id: string;
  name: string;
  industry: string;
  industry_custom: string | null;
  description: string | null;
  scope: DictionaryScope;
  project_id: string | null;
  icon_key: string;
  icon_color: string;
  categories: SavedTokenDictionary['categories'];
  tokens: SavedTokenDictionary['tokens'];
  created_at: string;
  updated_at: string;
}

export type KbFileFormat =
  | 'pdf'
  | 'docx'
  | 'xlsx'
  | 'csv'
  | 'json'
  | 'md'
  | 'txt'
  | 'image';
