import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type ColumnRole = 'selector' | 'data' | 'ignore';

export interface KbDocument {
  id: string;
  name: string;
  format: KbFileFormat;
  storage_path: string;
  file_size: number | null;
  column_headers: string[];
  column_roles: Record<string, ColumnRole>;
  created_at: string;
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
