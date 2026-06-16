/**
 * Deterministic agent dialog webhook (ElevenLabs tool target) — VB.NET runtime only.
 */
import type { Express, Request, Response } from 'express';
import type { AgentBundle, AgentParsedSlot } from '../../src/lib/agentBundleTypes';
import { convertSessionStateFromVb } from '../../src/lib/convertAgentBundleToVb';
import { loadPublishedAgentBundle } from '../services/loadPublishedBundle';
import { getSession, upsertSession, updateSessionState } from '../services/sessionStore';
import { initAgentSession, postVbAgentTurn } from '../services/vbEngineClient';

interface DialogStepBody {
  conversationId?: string;
  conversation_id?: string;
  parameters?: {
    conversationId?: string;
    conversation_id?: string;
    incomingSlots?: AgentParsedSlot[];
    transcript?: string;
  };
  incomingSlots?: AgentParsedSlot[];
  transcript?: string;
  bundle?: AgentBundle;
  reset?: boolean;
}

function resolveConversationId(req: Request, body: DialogStepBody): string | null {
  const fromBody = body.conversationId?.trim() || body.conversation_id?.trim();
  if (fromBody) return fromBody;

  const params = body.parameters;
  if (params && typeof params === 'object') {
    const fromParams = params.conversationId?.trim() || params.conversation_id?.trim();
    if (fromParams) return fromParams;
  }

  const fromHeader = req.headers['x-conversation-id']?.toString().trim();
  if (fromHeader) return fromHeader;

  return null;
}

function parseIncomingSlots(raw: unknown): AgentParsedSlot[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is AgentParsedSlot => (
      typeof s === 'object'
      && s != null
      && typeof (s as AgentParsedSlot).categoryName === 'string'
      && typeof (s as AgentParsedSlot).value === 'string'
    ))
    .map((s) => ({
      categoryName: s.categoryName.trim(),
      value: s.value.trim(),
    }))
    .filter((s) => s.categoryName && s.value);
}

export function mountAgentDialogStepRoutes(app: Express): void {
  app.post('/api/runtime/agent-dialog-step/:documentId', async (req: Request, res: Response) => {
    try {
      const documentId = req.params.documentId?.trim();
      if (!documentId) {
        res.status(400).json({ error: 'documentId mancante' });
        return;
      }

      const body = req.body as DialogStepBody;
      const conversationId = resolveConversationId(req, body);
      if (!conversationId) {
        res.status(400).json({
          error: 'conversationId mancante. Il tool webhook deve usare dynamic_variable system__conversation_id.',
        });
        return;
      }

      const incomingSlots = parseIncomingSlots(
        body.incomingSlots ?? body.parameters?.incomingSlots,
      );
      let bundle = body.bundle as AgentBundle | undefined;

      if (!bundle?.corpusItems?.length) {
        bundle = (await loadPublishedAgentBundle(documentId)) ?? undefined;
      }

      if (!bundle?.corpusItems?.length) {
        res.status(400).json({
          error: 'Nessun bundle pubblicato per questo documento. Pubblicare da Deploy ConvAI o includere bundle nel body.',
        });
        return;
      }

      let session = getSession(conversationId);
      const reset = Boolean(body.reset) || !session;
      if (!session || body.reset) {
        session = upsertSession(conversationId, documentId, bundle, initAgentSession());
      } else if (session.bundle.meta.compiledAt !== bundle.meta.compiledAt) {
        session = upsertSession(conversationId, documentId, bundle, session.state);
      }

      const http = await postVbAgentTurn({
        bundle: session.bundle,
        state: session.state,
        conversationId,
        documentId,
        incomingSlots,
        transcript: body.transcript ?? body.parameters?.transcript,
        reset,
      });

      if (http.nextState) {
        updateSessionState(conversationId, http.nextState);
      }

      res.json(http);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });
}
