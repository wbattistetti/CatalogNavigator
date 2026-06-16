/**
 * Frees VITE_DEV_PORT then starts the Vite dev server.
 */
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensurePortFree, resolveViteDevPort } from './ensurePortFree';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = resolveViteDevPort();

ensurePortFree(port);

const child = spawn('vite', [], {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, VITE_DEV_PORT: String(port) },
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
