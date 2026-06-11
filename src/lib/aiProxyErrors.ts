/**
 * User-facing messages for OpenAI edge proxy failures.
 */

export function formatAiProxyError(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes('name resolution failed') || lower.includes('failed to fetch')) {
    return (
      'Servizio IA non raggiungibile. Avvia le Edge Functions locali: ' +
      'npx supabase functions serve analyze-document --env-file supabase/functions/.env ' +
      '(oppure riavvia con npx supabase stop && npx supabase start).'
    );
  }

  if (lower.includes('openai_api_key not configured')) {
    return 'OPENAI_API_KEY mancante in supabase/functions/.env';
  }

  if (lower.includes('503') || lower.includes('server non disponibile') || lower.includes('service unavailable')) {
    return (
      'Edge Function analyze-document non disponibile (503). ' +
      'Esegui: npx supabase functions serve analyze-document --env-file supabase/functions/.env'
    );
  }

  return message;
}
