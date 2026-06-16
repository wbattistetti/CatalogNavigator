/**
 * Frees a TCP listen port before gateway startup (dev convenience on port-in-use errors).
 * Never touches Omnia Express (:3100).
 */
import { execSync } from 'node:child_process';
import { platform } from 'node:os';

/** Default gateway port — must not collide with Omnia Express (:3100). */
export const DEFAULT_CONVAI_GATEWAY_PORT = 3110;

/** Omnia Express dev port; never bind or kill listeners here from Agent Browser. */
export const OMNIA_EXPRESS_PORT = 3100;

function localPortFromNetstatLine(line: string): number | null {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const localAddr = parts[1];
  const portToken = localAddr.split(':').pop();
  const port = Number(portToken?.replace(/[^\d]/g, ''));
  return Number.isFinite(port) && port > 0 ? port : null;
}

function findListenerPids(port: number): number[] {
  const system = platform();
  try {
    if (system === 'win32') {
      // -p tcp omits IPv6 listeners (e.g. [::1]:5180) where Vite often binds.
      const out = execSync('netstat -ano', { encoding: 'utf8' });
      const pids = new Set<number>();
      for (const line of out.split('\n')) {
        if (!/LISTENING/i.test(line)) continue;
        if (localPortFromNetstatLine(line) !== port) continue;
        const parts = line.trim().split(/\s+/);
        const pid = Number(parts[parts.length - 1]);
        if (Number.isFinite(pid) && pid > 0) pids.add(pid);
      }
      return [...pids];
    }

    const out = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { encoding: 'utf8' });
    return out
      .split('\n')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
  } catch {
    return [];
  }
}

function terminatePid(pid: number): void {
  if (platform() === 'win32') {
    execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
    return;
  }
  process.kill(pid, 'SIGTERM');
}

/**
 * Kills processes listening on `port`, except the current process.
 * Skipped when CONVAI_GATEWAY_KILL_PORT=0 (e.g. shared production host).
 */
export function ensurePortFree(port: number): void {
  if (port === OMNIA_EXPRESS_PORT) {
    console.error(
      `Porta ${port} e riservata a Omnia Express. ` +
        `Imposta CONVAI_GATEWAY_PORT=${DEFAULT_CONVAI_GATEWAY_PORT} in backend/.env e riavvia.`
    );
    process.exit(1);
  }

  if (process.env.CONVAI_GATEWAY_KILL_PORT === '0') return;

  const pids = findListenerPids(port).filter((pid) => pid !== process.pid);
  if (pids.length === 0) return;

  for (const pid of pids) {
    try {
      terminatePid(pid);
      console.log(`Porta ${port}: terminato processo PID ${pid}.`);
    } catch {
      /* process may have already exited */
    }
  }
}
