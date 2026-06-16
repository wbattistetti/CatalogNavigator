/**
 * Frees a TCP listen port before dev server startup (Windows + Unix).
 */
import { config as loadEnv } from 'dotenv';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

loadEnv({ path: resolve(projectRoot, '.env') });
loadEnv({ path: resolve(projectRoot, '.env.local') });

export const DEFAULT_VITE_DEV_PORT = 5180;

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

/** Kills processes listening on `port`, except the current process. */
export function ensurePortFree(port: number): void {
  if (process.env.VITE_DEV_KILL_PORT === '0') return;

  const pids = findListenerPids(port).filter((pid) => pid !== process.pid);
  if (pids.length === 0) return;

  for (const pid of pids) {
    try {
      terminatePid(pid);
      console.log(`Porta ${port}: terminato processo PID ${pid}.`);
    } catch {
      /* already exited */
    }
  }
}

export function resolveViteDevPort(): number {
  const fromArg = Number(process.argv[2]);
  if (Number.isFinite(fromArg) && fromArg > 0) return fromArg;
  const fromEnv = Number(process.env.VITE_DEV_PORT);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return DEFAULT_VITE_DEV_PORT;
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : '';
const entry = fileURLToPath(import.meta.url);
if (invoked === entry) {
  ensurePortFree(resolveViteDevPort());
}
