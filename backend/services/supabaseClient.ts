/**
 * Supabase client for ConvAI gateway (loads published agent bundles).
 */
import { createClient } from '@supabase/supabase-js';

/** Standard local Supabase stack (supabase start). */
const LOCAL_DEV_SUPABASE_URL = 'http://127.0.0.1:54321';
const LOCAL_DEV_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

function resolveSupabaseUrl(): string | undefined {
  return process.env.SUPABASE_URL?.trim()
    || process.env.VITE_SUPABASE_URL?.trim()
    || LOCAL_DEV_SUPABASE_URL;
}

function resolveSupabaseKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    || process.env.SUPABASE_ANON_KEY?.trim()
    || process.env.VITE_SUPABASE_ANON_KEY?.trim()
    || LOCAL_DEV_ANON_KEY;
}

const supabaseUrl = resolveSupabaseUrl();
const supabaseKey = resolveSupabaseKey();

export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

export function logSupabaseGatewayStatus(): void {
  if (supabase) {
    console.log(`[convai-gateway] Supabase bundle loader: ${supabaseUrl}`);
    return;
  }
  console.warn(
    '[convai-gateway] Supabase non configurato: agent-dialog-step richiederà bundle nel body.',
  );
}

export function assertSupabaseConfigured(): void {
  if (!supabase) {
    throw new Error('SUPABASE_URL e SUPABASE_ANON_KEY mancanti per il gateway');
  }
}
