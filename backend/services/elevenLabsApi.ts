/**
 * ElevenLabs ConvAI REST client (server-side only).
 */

export interface ElevenLabsConfig {
  apiKey: string;
  apiBase: string;
}

export function resolveElevenLabsConfig(): ElevenLabsConfig {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY mancante in backend/.env');
  }
  const apiBase = (process.env.ELEVENLABS_API_BASE?.trim() || 'https://api.elevenlabs.io/v1').replace(/\/$/, '');
  return { apiKey, apiBase };
}

export async function elevenLabsFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const { apiKey, apiBase } = resolveElevenLabsConfig();
  const url = `${apiBase}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = new Headers(init.headers);
  headers.set('xi-api-key', apiKey);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(url, { ...init, headers });
}
