/**
 * Proxy REST routes to ElevenLabs ConvAI API (xi-api-key server-side).
 */
import type { Express, Request, Response } from 'express';
import { elevenLabsFetch } from '../services/elevenLabsApi';

function upstreamPathWithQuery(req: Request, upstreamPath: string): string {
  const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  return `${upstreamPath}${q}`;
}

async function proxyJson(req: Request, res: Response, upstreamPath: string, method: string): Promise<void> {
  try {
    const body = method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(req.body ?? {});
    const upstream = await elevenLabsFetch(upstreamPath, { method, body });
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('Content-Type') ?? 'application/json');
    res.send(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
}

export function mountElevenLabsProxyRoutes(app: Express): void {
  app.post('/elevenlabs/createAgent', (req, res) => {
    void proxyJson(req, res, '/convai/agents/create', 'POST');
  });

  app.get('/elevenlabs/agents', (req, res) => {
    void proxyJson(req, res, upstreamPathWithQuery(req, '/convai/agents'), 'GET');
  });

  app.get('/elevenlabs/agents/:agentId', (req, res) => {
    void proxyJson(req, res, `/convai/agents/${req.params.agentId}`, 'GET');
  });

  app.patch('/elevenlabs/agents/:agentId', (req, res) => {
    void proxyJson(req, res, `/convai/agents/${req.params.agentId}`, 'PATCH');
  });

  app.delete('/elevenlabs/agents/:agentId', (req, res) => {
    void proxyJson(req, res, `/convai/agents/${req.params.agentId}`, 'DELETE');
  });

  app.post('/elevenlabs/knowledge-base/text', (req, res) => {
    void proxyJson(req, res, '/convai/knowledge-base/text', 'POST');
  });

  app.patch('/elevenlabs/knowledge-base/:docId', (req, res) => {
    void proxyJson(req, res, `/convai/knowledge-base/${req.params.docId}`, 'PATCH');
  });

  app.delete('/elevenlabs/knowledge-base/:docId', (req, res) => {
    const force = req.query.force === 'true' ? '?force=true' : '';
    void proxyJson(req, res, `/convai/knowledge-base/${req.params.docId}${force}`, 'DELETE');
  });

  app.get('/elevenlabs/knowledge-base', (req, res) => {
    void proxyJson(req, res, upstreamPathWithQuery(req, '/convai/knowledge-base'), 'GET');
  });

  app.get('/elevenlabs/tools', (req, res) => {
    void proxyJson(req, res, upstreamPathWithQuery(req, '/convai/tools'), 'GET');
  });

  app.get('/elevenlabs/tools/:toolId', (req, res) => {
    void proxyJson(req, res, `/convai/tools/${req.params.toolId}`, 'GET');
  });

  app.post('/elevenlabs/tools', (req, res) => {
    void proxyJson(req, res, '/convai/tools', 'POST');
  });

  app.patch('/elevenlabs/tools/:toolId', (req, res) => {
    void proxyJson(req, res, `/convai/tools/${req.params.toolId}`, 'PATCH');
  });
}
