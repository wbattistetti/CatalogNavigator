import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  MessageSquareText,
  Pencil,
  RotateCcw,
  Send,
  X,
} from 'lucide-react';
import type { AgentBundle, AgentSessionState } from '../../lib/agentBundleTypes';
import { pingVbEngine, postVbTextTurn } from '../../lib/vbTestEngineClient';

export interface DisambiguationPlanMessagePatch {
  signature: string;
  question?: string | null;
  no_match_1?: string | null;
  no_match_2?: string | null;
  no_match_3?: string | null;
}

interface ChatPanelProps {
  agentBundle?: AgentBundle | null;
  onClose: () => void;
  onPatchDisambiguationMessage?: (patch: DisambiguationPlanMessagePatch) => void;
}

type PlanCopyField = 'question' | 'no_match_1' | 'no_match_2' | 'no_match_3';

interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
  isResult?: boolean;
  hintSource?: 'disambiguation_plan' | 'disambiguation_plan_no_match' | 'template';
  disambiguationSignature?: string;
  editablePlanField?: PlanCopyField;
}

const CHAT_TEXT = 'text-xs leading-relaxed';

function AgentMessageBubble({
  msg,
  onSave,
}: {
  msg: ChatMessage;
  onSave: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(msg.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canEdit = !!msg.disambiguationSignature
    && (msg.hintSource === 'disambiguation_plan' || msg.hintSource === 'disambiguation_plan_no_match');
  const hasDisambiguationMeta = !!msg.hintSource;
  const isPersonalized = msg.hintSource === 'disambiguation_plan'
    || msg.hintSource === 'disambiguation_plan_no_match';
  const metaLabel = msg.hintSource === 'disambiguation_plan'
    ? 'Messaggio di disambiguazione personalizzato'
    : msg.hintSource === 'disambiguation_plan_no_match'
      ? 'Re-prompt personalizzato'
      : 'Template VB';
  const metaToneClass = msg.hintSource === 'template'
    ? 'text-amber-300/70'
    : 'text-sky-300/70';

  useEffect(() => {
    if (editing) {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    }
  }, [editing]);

  useEffect(() => {
    if (!editing) setDraft(msg.text);
  }, [msg.text, editing]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== msg.text) onSave(trimmed);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="space-y-2">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          className={`w-full bg-[#0a1510] border border-emerald-400/40 rounded px-2 py-1.5 font-sans ${CHAT_TEXT} text-emerald-100 resize-y focus:outline-none focus:border-emerald-400/70`}
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={commit}
            className={`px-2 py-1 rounded border border-emerald-400/40 bg-emerald-400/15 text-emerald-200 font-mono ${CHAT_TEXT}`}
          >
            Salva
          </button>
          <button
            type="button"
            onClick={() => { setDraft(msg.text); setEditing(false); }}
            className={`px-2 py-1 rounded border border-[#1a3a2a] text-emerald-400/60 font-mono ${CHAT_TEXT}`}
          >
            Annulla
          </button>
        </div>
      </div>
    );
  }

  if (hasDisambiguationMeta) {
    return (
      <div className="group relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-start gap-1.5 text-left text-emerald-100/85 hover:text-emerald-100 transition-colors"
          aria-expanded={open}
        >
          <ChevronDown
            className={`w-3 h-3 flex-shrink-0 mt-0.5 transition-transform ${open ? '' : '-rotate-90'}`}
          />
          {isPersonalized && (
            <MessageSquareText className="w-3 h-3 flex-shrink-0 mt-0.5 text-sky-400/80" aria-hidden />
          )}
          <span className={`font-sans ${CHAT_TEXT} flex-1 min-w-0`}>{msg.text}</span>
        </button>
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="Modifica messaggio nel piano disambiguazione"
            className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 p-1 rounded bg-[#0a1510] border border-emerald-400/30 text-emerald-400/70 hover:text-emerald-300 transition-opacity"
          >
            <Pencil className="w-3 h-3" />
          </button>
        )}
        {open && (
          <div className="mt-2 pt-2 border-t border-[#1a3a2a]/80 pl-[18px]">
            <p className={`font-mono ${CHAT_TEXT} ${metaToneClass}`}>{metaLabel}</p>
            {msg.disambiguationSignature && (
              <p
                className={`mt-1 font-mono ${CHAT_TEXT} text-emerald-400/50 break-all`}
                title={msg.disambiguationSignature}
              >
                {msg.disambiguationSignature}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <p className={`font-sans ${CHAT_TEXT} text-emerald-100/85`}>{msg.text}</p>
  );
}

interface ChatUiState {
  messages: ChatMessage[];
  selectedPath: string | null;
  candidatePaths: string[] | null;
}

function initChatState(bundle: AgentBundle): ChatUiState {
  const opening = bundle.analysis.start_question?.trim();
  return {
    messages: opening
      ? [{ id: '0', role: 'agent', text: opening }]
      : [{
        id: '0',
        role: 'agent',
        text: 'Imposta la Domanda di start nella barra in alto, poi salva.',
      }],
    selectedPath: null,
    candidatePaths: null,
  };
}

/** Changes only when the conversation should restart (not on disambiguation copy edits). */
function buildChatSessionResetKey(bundle: AgentBundle): string {
  return [
    bundle.meta.documentId ?? '',
    bundle.analysis.id ?? '',
    bundle.analysis.start_question ?? '',
  ].join('|');
}

export function ChatPanel({
  agentBundle = null,
  onClose,
  onPatchDisambiguationMessage,
}: ChatPanelProps) {
  const [state, setState] = useState<ChatUiState>(() => (
    agentBundle ? initChatState(agentBundle) : { messages: [], selectedPath: null, candidatePaths: null }
  ));
  const [vbSession, setVbSession] = useState<AgentSessionState | null>(null);
  const [vbOnline, setVbOnline] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const msgId = useRef(1);
  const sessionResetKeyRef = useRef<string | null>(null);

  const nextMsgId = () => String(++msgId.current);

  const focusInput = useCallback(() => {
    if (inputRef.current && !state.selectedPath) {
      inputRef.current.focus();
    }
  }, [state.selectedPath]);

  const restart = useCallback(() => {
    setVbSession(null);
    if (agentBundle) setState(initChatState(agentBundle));
    setInput('');
  }, [agentBundle]);

  const handlePatchMessage = useCallback((msg: ChatMessage, newText: string) => {
    if (!msg.disambiguationSignature || !onPatchDisambiguationMessage) return;
    const field = msg.editablePlanField ?? 'question';
    onPatchDisambiguationMessage({
      signature: msg.disambiguationSignature,
      [field]: newText,
    });
    setState((prev) => ({
      ...prev,
      messages: prev.messages.map((m) => (
        m.id === msg.id ? { ...m, text: newText } : m
      )),
    }));
  }, [onPatchDisambiguationMessage]);

  const submit = async () => {
    const trimmed = input.trim();
    if (!trimmed || state.selectedPath !== null || !agentBundle || loading) return;

    setState((prev) => ({
      ...prev,
      messages: [...prev.messages, { id: nextMsgId(), role: 'user', text: trimmed }],
    }));
    setInput('');
    setLoading(true);

    try {
      const result = await postVbTextTurn({
        userText: trimmed,
        bundle: agentBundle,
        state: vbSession,
      });

      const nextState = result.nextState ?? null;
      setVbSession(nextState);

      const spoken = result.spokenHint?.trim() ?? '';
      const selectedPath = result.selectedPath ?? nextState?.selectedPath ?? null;
      const isConfirm = result.instruction?.action === 'confirm' && !!selectedPath;
      const hintSource = result.instruction?.action === 'disambiguate'
        && (result.spokenHintSource === 'disambiguation_plan'
          || result.spokenHintSource === 'disambiguation_plan_no_match'
          || result.spokenHintSource === 'template')
        ? result.spokenHintSource
        : undefined;

      const editablePlanField: PlanCopyField | undefined =
        hintSource === 'disambiguation_plan_no_match'
          ? 'no_match_1'
          : hintSource === 'disambiguation_plan'
            ? 'question'
            : undefined;

      setState((prev) => {
        const nextMessages = [...prev.messages];
        if (spoken) {
          nextMessages.push({
            id: nextMsgId(),
            role: 'agent',
            text: spoken,
            isResult: isConfirm,
            hintSource,
            disambiguationSignature: result.disambiguationSignature,
            editablePlanField,
          });
        }
        return {
          ...prev,
          messages: nextMessages,
          selectedPath,
          candidatePaths: result.candidatePaths ?? prev.candidatePaths,
        };
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState((prev) => ({
        ...prev,
        messages: [
          ...prev.messages,
          {
            id: nextMsgId(),
            role: 'agent',
            text: `Motore VB non raggiungibile: ${message}. Avvia DialogEngine.Api (porta 5190).`,
          },
        ],
      }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages]);

  useEffect(() => {
    if (!loading && state.selectedPath === null) {
      focusInput();
    }
  }, [loading, state.selectedPath, focusInput, state.messages.length]);

  useEffect(() => {
    if (!agentBundle) {
      sessionResetKeyRef.current = null;
      return;
    }
    const resetKey = buildChatSessionResetKey(agentBundle);
    if (sessionResetKeyRef.current === resetKey) return;
    sessionResetKeyRef.current = resetKey;
    setVbSession(null);
    setState(initChatState(agentBundle));
  }, [agentBundle]);

  useEffect(() => {
    let cancelled = false;
    void pingVbEngine().then((ok) => {
      if (!cancelled) setVbOnline(ok);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    focusInput();
  }, [focusInput]);

  if (!agentBundle) {
    return (
      <div className="flex flex-col h-full min-h-0 w-full flex-shrink-0 border-l border-[#1a3a2a] bg-[#080e0a] p-4">
        <p className={`font-mono ${CHAT_TEXT} text-emerald-400/60`}>Compila e pubblica il bundle per testare il motore VB.</p>
        <button onClick={onClose} className={`mt-4 font-mono ${CHAT_TEXT} text-emerald-400/70`}>Chiudi</button>
      </div>
    );
  }

  const isDone = state.selectedPath !== null;

  return (
    <div className="flex flex-col h-full min-h-0 w-full flex-shrink-0 border-l border-[#1a3a2a] bg-[#080e0a]">
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b border-[#1a3a2a] bg-[#060c08]">
        <div className="flex items-center gap-2 min-w-0">
          <Bot className="w-3.5 h-3.5 text-emerald-400/70 flex-shrink-0" />
          <span className={`font-mono ${CHAT_TEXT} font-semibold text-emerald-400/80 uppercase tracking-wider truncate`}>
            Test Motore VB
          </span>
          <span
            className={`font-mono ${CHAT_TEXT} px-1.5 py-0.5 rounded border flex-shrink-0 ${
              vbOnline === false
                ? 'text-amber-300/80 border-amber-400/30 bg-amber-400/8'
                : 'text-sky-300/80 border-sky-400/30 bg-sky-400/8'
            }`}
          >
            VB{vbOnline === false ? ' off' : ''}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={restart} title="Riavvia" className="p-1 rounded text-emerald-400/40 hover:text-emerald-400/80 hover:bg-emerald-400/10 transition-colors">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button onClick={onClose} title="Chiudi" className="p-1 rounded text-emerald-400/40 hover:text-emerald-400/80 hover:bg-emerald-400/10 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {vbOnline === false && (
        <div className="flex-shrink-0 flex items-start gap-2 px-3 py-2 border-b border-amber-400/20 bg-amber-400/5">
          <AlertCircle className="w-3.5 h-3.5 text-amber-400/70 flex-shrink-0 mt-0.5" />
          <p className={`font-mono ${CHAT_TEXT} text-amber-300/80`}>
            Avvia DialogEngine.Api in Visual Studio (F5, porta 5190).
          </p>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-3">
        {state.messages.map((msg) => {
          if (msg.isResult) {
            return (
              <div key={msg.id} className="flex flex-col items-center gap-2 py-2">
                <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-amber-400/8 border border-amber-400/25 w-full">
                  <CheckCircle2 className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className={`font-sans ${CHAT_TEXT} text-amber-200`}>{msg.text}</p>
                    <p className={`font-mono ${CHAT_TEXT} text-amber-400/50 mt-1 break-all`}>{state.selectedPath}</p>
                  </div>
                </div>
              </div>
            );
          }
          if (msg.role === 'agent') {
            return (
              <div key={msg.id} className="flex items-start gap-2">
                <div className="max-w-[92%] px-3 py-2 rounded-lg bg-[#0d1f10] border border-[#1a3a2a]">
                  <AgentMessageBubble
                    msg={msg}
                    onSave={(text) => handlePatchMessage(msg, text)}
                  />
                </div>
              </div>
            );
          }
          return (
            <div key={msg.id} className="flex justify-end">
              <div className="max-w-[92%] px-3 py-2 rounded-lg bg-emerald-400/15 border border-emerald-400/18">
                <p className={`font-sans ${CHAT_TEXT} text-emerald-200`}>{msg.text}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="flex-shrink-0 px-3 py-2.5 border-t border-[#1a3a2a] bg-[#060c08]">
        {isDone ? (
          <button
            onClick={restart}
            className={`w-full font-mono ${CHAT_TEXT} text-emerald-400/70 border border-[#1a3a2a] rounded py-1.5`}
          >
            Nuovo test
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !loading && void submit()}
              placeholder={loading ? 'Elaborazione…' : 'Scrivi la tua risposta…'}
              disabled={loading}
              className={`flex-1 bg-[#0a1510] border border-[#1a3a2a] rounded px-3 py-1.5 font-sans ${CHAT_TEXT} text-emerald-100/90 disabled:opacity-50 focus:outline-none focus:border-emerald-400/40`}
            />
            <button onClick={() => void submit()} disabled={!input.trim() || loading} className="p-1.5 rounded bg-emerald-400/20 text-emerald-400 disabled:opacity-25">
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
