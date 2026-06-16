import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, RotateCcw, X, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import type { AgentBundle, AgentSessionState } from '../../lib/agentBundleTypes';
import { pingVbEngine, postVbTextTurn } from '../../lib/vbTestEngineClient';

interface ChatPanelProps {
  agentBundle?: AgentBundle | null;
  onClose: () => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
  isResult?: boolean;
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

export function ChatPanel({ agentBundle = null, onClose }: ChatPanelProps) {
  const [state, setState] = useState<ChatUiState>(() => (
    agentBundle ? initChatState(agentBundle) : { messages: [], selectedPath: null, candidatePaths: null }
  ));
  const [vbSession, setVbSession] = useState<AgentSessionState | null>(null);
  const [vbOnline, setVbOnline] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const msgId = useRef(1);

  const nextMsgId = () => String(++msgId.current);

  const restart = useCallback(() => {
    setVbSession(null);
    if (agentBundle) setState(initChatState(agentBundle));
    setInput('');
  }, [agentBundle]);

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

      setState((prev) => {
        const nextMessages = [...prev.messages];
        if (spoken) {
          nextMessages.push({
            id: nextMsgId(),
            role: 'agent',
            text: spoken,
            isResult: isConfirm,
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
    if (agentBundle) {
      setVbSession(null);
      setState(initChatState(agentBundle));
    }
  }, [agentBundle?.meta.compiledAt, agentBundle?.analysis.start_question]);

  useEffect(() => {
    let cancelled = false;
    void pingVbEngine().then((ok) => {
      if (!cancelled) setVbOnline(ok);
    });
    return () => { cancelled = true; };
  }, []);

  if (!agentBundle) {
    return (
      <div className="flex flex-col h-full border-l border-[#1a3a2a] bg-[#080e0a] p-4" style={{ width: 360, flexShrink: 0 }}>
        <p className="font-mono text-[10px] text-emerald-400/45">Compila e pubblica il bundle per testare il motore VB.</p>
        <button onClick={onClose} className="mt-4 font-mono text-xs text-emerald-400/60">Chiudi</button>
      </div>
    );
  }

  const isDone = state.selectedPath !== null;

  return (
    <div className="flex flex-col h-full border-l border-[#1a3a2a] bg-[#080e0a]" style={{ width: 360, flexShrink: 0 }}>
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b border-[#1a3a2a] bg-[#060c08]">
        <div className="flex items-center gap-2 min-w-0">
          <Bot className="w-3.5 h-3.5 text-emerald-400/70 flex-shrink-0" />
          <span className="font-mono text-xs font-semibold text-emerald-400/80 uppercase tracking-wider truncate">
            Test Motore VB
          </span>
          <span
            className={`font-mono text-[8px] px-1.5 py-0.5 rounded border flex-shrink-0 ${
              vbOnline === false
                ? 'text-amber-300/70 border-amber-400/30 bg-amber-400/8'
                : 'text-sky-300/70 border-sky-400/30 bg-sky-400/8'
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
          <p className="font-mono text-[9px] text-amber-300/75 leading-relaxed">
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
                    <p className="font-sans text-xs text-amber-200 leading-relaxed">{msg.text}</p>
                    <p className="font-mono text-[9px] text-amber-400/40 mt-1 break-all">{state.selectedPath}</p>
                  </div>
                </div>
              </div>
            );
          }
          if (msg.role === 'agent') {
            return (
              <div key={msg.id} className="flex items-start gap-2">
                <div className="max-w-[82%] px-3 py-2 rounded-lg bg-[#0d1f10] border border-[#1a3a2a]">
                  <p className="font-sans text-xs text-emerald-100/80 leading-relaxed">{msg.text}</p>
                </div>
              </div>
            );
          }
          return (
            <div key={msg.id} className="flex justify-end">
              <div className="max-w-[82%] px-3 py-2 rounded-lg bg-emerald-400/15 border border-emerald-400/18">
                <p className="font-sans text-xs text-emerald-200 leading-relaxed">{msg.text}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="flex-shrink-0 px-3 py-2.5 border-t border-[#1a3a2a] bg-[#060c08]">
        {isDone ? (
          <button onClick={restart} className="w-full font-mono text-xs text-emerald-400/60 border border-[#1a3a2a] rounded py-1.5">
            Nuovo test
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !loading && void submit()}
              placeholder={loading ? 'Elaborazione…' : 'Scrivi la tua risposta…'}
              disabled={loading}
              className="flex-1 bg-[#0a1510] border border-[#1a3a2a] rounded px-3 py-1.5 font-sans text-xs text-emerald-100/85 disabled:opacity-50"
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
