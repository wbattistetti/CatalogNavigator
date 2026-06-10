import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type ColumnRole = 'selector' | 'data' | 'description' | 'ignore';

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

export interface KbProject {
  id: string;
  name: string;
  description: string | null;
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
