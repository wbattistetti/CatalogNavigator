import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  ensureConvaiDeployTunnelReady,
  fetchNgrokStatus,
} from './convaiDevTunnel';

describe('ensureConvaiDeployTunnelReady', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reuses tunnel when running and reachable', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tunnels: {
          '3110': {
            running: true,
            publicUrl: 'https://abc.ngrok-free.app',
            reachable: true,
          },
        },
      }),
    } as Response);

    const url = await ensureConvaiDeployTunnelReady();
    expect(url).toBe('https://abc.ngrok-free.app');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('restarts tunnel when running but not reachable (stale zombie)', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tunnels: {
            '3110': {
              running: true,
              publicUrl: 'https://dead.ngrok-free.app',
              reachable: false,
            },
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tunnels: {
            '3110': { publicUrl: 'https://fresh.ngrok-free.app' },
          },
        }),
      } as Response);

    const url = await ensureConvaiDeployTunnelReady();
    expect(url).toBe('https://fresh.ngrok-free.app');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls[1]?.[0]).toContain('/api/dev-tunnel/ngrok/start');
  });
});

describe('fetchNgrokStatus', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns reachable flag from gateway status', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tunnels: {
          '3110': {
            running: true,
            publicUrl: 'https://x.ngrok-free.app',
            reachable: false,
          },
        },
      }),
    } as Response);

    const status = await fetchNgrokStatus();
    expect(status.reachable).toBe(false);
  });
});
