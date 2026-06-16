/**
 * Dev tunnel helpers: ngrok status/start and localhost URL rewrite for ConvAI deploy.
 */

const DEFAULT_GATEWAY_PORT = 3110;
const GATEWAY_PORT = Number(
  (import.meta.env.VITE_CONVAI_GATEWAY_PORT as string | undefined)?.trim()
    || DEFAULT_GATEWAY_PORT,
);
const LOCALHOST_PATTERNS = [
  `http://localhost:${GATEWAY_PORT}`,
  `https://localhost:${GATEWAY_PORT}`,
  `http://127.0.0.1:${GATEWAY_PORT}`,
  `https://127.0.0.1:${GATEWAY_PORT}`,
];

export interface NgrokTunnelInfo {
  running: boolean;
  publicUrl: string | null;
}

export function convaiGatewayOrigin(): string {
  return (import.meta.env.VITE_CONVAI_GATEWAY_ORIGIN as string | undefined)?.trim()
    || `http://localhost:${GATEWAY_PORT}`;
}

export async function fetchNgrokStatus(apiBase = convaiGatewayOrigin()): Promise<NgrokTunnelInfo> {
  const res = await fetch(`${apiBase}/api/dev-tunnel/ngrok/status`);
  if (!res.ok) throw new Error(`ngrok status failed: ${res.status}`);
  const data = await res.json() as { tunnels?: Record<string, NgrokTunnelInfo> };
  return data.tunnels?.[String(GATEWAY_PORT)] ?? { running: false, publicUrl: null };
}

export async function startNgrokTunnel(
  authtoken?: string,
  apiBase = convaiGatewayOrigin(),
): Promise<string> {
  const res = await fetch(`${apiBase}/api/dev-tunnel/ngrok/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ports: [GATEWAY_PORT], authtoken }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ngrok start failed: ${err}`);
  }
  const data = await res.json() as { tunnels?: Record<string, { publicUrl?: string }> };
  const publicUrl = data.tunnels?.[String(GATEWAY_PORT)]?.publicUrl;
  if (!publicUrl) throw new Error('ngrok non ha restituito publicUrl');
  return publicUrl.replace(/\/$/, '');
}

/** Ensures ngrok tunnel is up; returns public base URL. */
export async function ensureConvaiDeployTunnelReady(authtoken?: string): Promise<string> {
  const status = await fetchNgrokStatus();
  if (status.running && status.publicUrl) return status.publicUrl.replace(/\/$/, '');
  return startNgrokTunnel(authtoken);
}

/** Deep-replaces localhost gateway URLs with ngrok public URL before ElevenLabs deploy. */
export function rewritePayloadWithDevTunnel<T>(payload: T, publicBaseUrl: string): T {
  const json = JSON.stringify(payload);
  let rewritten = json;
  for (const local of LOCALHOST_PATTERNS) {
    rewritten = rewritten.split(local).join(publicBaseUrl.replace(/\/$/, ''));
  }
  return JSON.parse(rewritten) as T;
}

export function buildAgentDialogStepWebhookUrl(documentId: string, origin = convaiGatewayOrigin()): string {
  return `${origin.replace(/\/$/, '')}/api/runtime/agent-dialog-step/${documentId}`;
}
