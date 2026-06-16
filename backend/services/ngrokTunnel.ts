/**
 * ngrok multi-port tunnel for local ConvAI webhook reachability.
 */
import ngrok from '@ngrok/ngrok';

const listeners = new Map<number, ngrok.Listener>();

export interface TunnelStatus {
  running: boolean;
  publicUrl: string | null;
}

export function getTunnelStatus(port: number): TunnelStatus {
  const listener = listeners.get(port);
  return {
    running: Boolean(listener),
    publicUrl: listener?.url() ?? null,
  };
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
  return publicUrl.replace(/\/$/, '');
}

export async function stopTunnel(port: number): Promise<void> {
  const existing = listeners.get(port);
  if (existing) {
    await existing.close();
    listeners.delete(port);
  }
}

export async function stopAllTunnels(): Promise<void> {
  for (const port of [...listeners.keys()]) {
    await stopTunnel(port);
  }
}
