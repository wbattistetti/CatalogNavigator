/**
 * ngrok multi-port tunnel for local ConvAI webhook reachability.
 */
import ngrok from '@ngrok/ngrok';

const listeners = new Map<number, ngrok.Listener>();

export interface TunnelStatus {
  running: boolean;
  publicUrl: string | null;
  /** True when the public URL returns gateway /health (not a stale zombie listener). */
  reachable: boolean;
}

/** Probes the tunnel by hitting gateway /health through the public ngrok URL. */
export async function probeTunnelReachable(publicUrl: string): Promise<boolean> {
  const base = publicUrl?.trim().replace(/\/$/, '');
  if (!base) return false;

  try {
    const res = await fetch(`${base}/health`, {
      headers: { 'ngrok-skip-browser-warning': '1' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return false;
    const data = await res.json() as { ok?: boolean; service?: string };
    return data.ok === true && data.service === 'convai-gateway';
  } catch {
    return false;
  }
}

export async function getTunnelStatus(port: number): Promise<TunnelStatus> {
  const listener = listeners.get(port);
  const publicUrl = listener?.url() ?? null;
  const running = Boolean(listener);
  const reachable = running && publicUrl
    ? await probeTunnelReachable(publicUrl)
    : false;
  return { running, publicUrl, reachable };
}

export async function startTunnel(port: number, authtoken?: string): Promise<string> {
  const token = authtoken?.trim() || process.env.NGROK_AUTHTOKEN?.trim();
  if (!token) {
    throw new Error('NGROK_AUTHTOKEN mancante (env o body authtoken)');
  }

  await stopTunnel(port);

  const listener = await ngrok.forward({
    addr: port,
    authtoken: token,
  });
  listeners.set(port, listener);
  const publicUrl = listener.url();
  if (!publicUrl) throw new Error('ngrok non ha restituito publicUrl');

  const normalized = publicUrl.replace(/\/$/, '');
  if (!await probeTunnelReachable(normalized)) {
    await stopTunnel(port);
    throw new Error(
      `Tunnel ngrok avviato ma non raggiungibile su ${normalized}/health. Riavvia il gateway (npm run be:gateway).`,
    );
  }

  return normalized;
}

/** Restarts the tunnel when missing or not reachable from the internet. */
export async function ensureTunnel(port: number, authtoken?: string): Promise<string> {
  const status = await getTunnelStatus(port);
  if (status.running && status.publicUrl && status.reachable) {
    return status.publicUrl.replace(/\/$/, '');
  }
  return startTunnel(port, authtoken);
}

export async function stopTunnel(port: number): Promise<void> {
  const existing = listeners.get(port);
  if (!existing) return;

  try {
    await existing.close();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[ngrok] close listener on port ${port} failed (evicting stale handle): ${message}`);
  } finally {
    listeners.delete(port);
  }
}

export async function stopAllTunnels(): Promise<void> {
  for (const port of [...listeners.keys()]) {
    await stopTunnel(port);
  }
}
