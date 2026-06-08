/**
 * Invokes a Supabase edge function and surfaces readable error messages.
 */
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

export async function invokeFunction<T>(
  name: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) throw new DOMException('Generazione annullata', 'AbortError');

  const { data, error } = await supabase.functions.invoke(name, { body, signal });

  if (signal?.aborted) throw new DOMException('Generazione annullata', 'AbortError');

  if (error) {
    if (signal?.aborted) throw new DOMException('Generazione annullata', 'AbortError');
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
