/**
 * ConvAI gateway: ElevenLabs proxy, ngrok tunnel, deterministic agent dialog webhook.
 */
import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '.env') });
loadEnv({ path: resolve(__dirname, '..', '.env') });
import cors from 'cors';
import express from 'express';
import { mountElevenLabsProxyRoutes } from './elevenlabs/proxyRoutes';
import { mountAgentDialogStepRoutes } from './routes/agentDialogStepRoutes';
import { mountNgrokRoutes } from './routes/ngrokRoutes';
import { DEFAULT_CONVAI_GATEWAY_PORT, ensurePortFree } from './lib/ensurePortFree';
import { logSupabaseGatewayStatus } from './services/supabaseClient';

const PORT = Number(process.env.CONVAI_GATEWAY_PORT ?? DEFAULT_CONVAI_GATEWAY_PORT);

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'convai-gateway', port: PORT });
});

mountElevenLabsProxyRoutes(app);
mountNgrokRoutes(app);
mountAgentDialogStepRoutes(app);

ensurePortFree(PORT);

app.listen(PORT, () => {
  logSupabaseGatewayStatus();
  console.log(`ConvAI gateway listening on http://localhost:${PORT}`);
});
