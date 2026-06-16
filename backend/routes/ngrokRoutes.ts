/**
 * REST routes for ngrok dev tunnel management.
 */
import type { Express, Request, Response } from 'express';
import {
  getTunnelStatus,
  startTunnel,
  stopAllTunnels,
  stopTunnel,
} from '../services/ngrokTunnel';

const DEFAULT_PORT = Number(process.env.CONVAI_GATEWAY_PORT ?? 3110);

export function mountNgrokRoutes(app: Express): void {
  app.get('/api/dev-tunnel/ngrok/status', (_req: Request, res: Response) => {
    const status = getTunnelStatus(DEFAULT_PORT);
    res.json({
      ok: true,
      tunnels: {
        [String(DEFAULT_PORT)]: status,
      },
    });
  });

  app.post('/api/dev-tunnel/ngrok/start', async (req: Request, res: Response) => {
    try {
      const ports: number[] = Array.isArray(req.body?.ports) && req.body.ports.length > 0
        ? req.body.ports.map(Number)
        : [DEFAULT_PORT];
      const authtoken = typeof req.body?.authtoken === 'string' ? req.body.authtoken : undefined;
      const tunnels: Record<string, { running: boolean; publicUrl: string | null }> = {};
      for (const port of ports) {
        const publicUrl = await startTunnel(port, authtoken);
        tunnels[String(port)] = { running: true, publicUrl };
      }
      res.json({ ok: true, tunnels });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  app.post('/api/dev-tunnel/ngrok/stop', async (_req: Request, res: Response) => {
    try {
      await stopAllTunnels();
      res.json({ ok: true, running: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  app.post('/api/dev-tunnel/ngrok/stop/:port', async (req: Request, res: Response) => {
    try {
      const port = Number(req.params.port);
      await stopTunnel(port);
      res.json({ ok: true, running: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });
}
