/**
 * Invokes a Supabase edge function and surfaces readable error messages.
 */
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

export async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });

  if (error) {
    if (error instanceof FunctionsHttpError && error.context) {
      try {
        const res = error.context as Response;
        const payload = await res.json();
        if (payload?.error) throw new Error(String(payload.error));
      } catch (parseErr) {
        if (parseErr instanceof Error && parseErr.message !== error.message) throw parseErr;
      }
    }
    throw new Error(error.message);
  }

  const payload = data as T & { error?: string };
  if (payload?.error) throw new Error(payload.error);
  return payload;
}
