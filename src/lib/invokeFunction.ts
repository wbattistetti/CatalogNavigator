/**
 * Invokes a Supabase edge function and surfaces readable error messages.
 */
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

/** Reads the JSON/text body from a failed edge function response. */
async function extractFunctionError(error: unknown, data: unknown): Promise<string | null> {
  if (data && typeof data === 'object' && 'error' in data) {
    const msg = (data as { error?: unknown }).error;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }

  if (!(error instanceof FunctionsHttpError)) return null;
  const ctx = error.context;
  if (!(ctx instanceof Response)) return null;

  try {
    const text = await ctx.clone().text();
    if (!text.trim()) return null;
    try {
      const json = JSON.parse(text) as Record<string, unknown>;
      if (typeof json.error === 'string' && json.error.trim()) return json.error;
      if (typeof json.message === 'string' && json.message.trim()) return json.message;
    } catch {
      // not JSON — fall through to raw text
    }
    return text.length > 400 ? `${text.slice(0, 400)}…` : text;
  } catch {
    return null;
  }
}

export async function invokeFunction<T>(
  name: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) throw new DOMException('Generazione annullata', 'AbortError');

  const { data, error } = await supabase.functions.invoke(name, { body });

  if (signal?.aborted) throw new DOMException('Generazione annullata', 'AbortError');

  if (error) {
    if (signal?.aborted) throw new DOMException('Generazione annullata', 'AbortError');
    const detailed = await extractFunctionError(error, data);
    throw new Error(detailed ?? error.message);
  }

  const payload = data as T & { error?: string };
  if (payload?.error) throw new Error(payload.error);
  return payload;
}
