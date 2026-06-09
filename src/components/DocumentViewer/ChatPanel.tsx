import { useEffect, useRef, useState } from 'react';
import { Bot, RotateCcw, X, Send, CheckCircle2 } from 'lucide-react';
import type { AnalysisRow } from '../../hooks/useAnalysis';
import { initTest, processInput, type AgentTestConfig, type TestState } from '../../lib/testEngine';

interface ChatPanelProps {
  rows: AnalysisRow[];
  agentConfig: AgentTestConfig;
  onClose: () => void;
}

export function ChatPanel({ rows, agentConfig, onClose }: ChatPanelProps) {
  const [state, setState] = useState<TestState>(() => initTest(rows, agentConfig));
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const restart = () => {
    setState(initTest(rows, agentConfig));
    setInput('');
  };

  const submit = () => {
    const trimmed = input.trim();
    if (!trimmed || state.selectedPath !== null) return;
    setState((prev) => processInput(prev, trimmed, rows, agentConfig));
    setInput('');
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages]);

  useEffect(() => {
    setState(initTest(rows, agentConfig));
  }, [agentConfig.start_question, agentConfig.confirmation_preamble]);

  const isDone = state.selectedPath !== null;

  return (
    <div
      className="flex flex-col h-full border-l border-[#1a3a2a] bg-[#080e0a]"
      style={{ width: 360, flexShrink: 0 }}
    >
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b border-[#1a3a2a] bg-[#060c08]">
        <div className="flex items-center gap-2">
          <Bot className="w-3.5 h-3.5 text-emerald-400/70" />
          <span className="font-mono text-xs font-semibold text-emerald-400/80 uppercase tracking-wider">
            Test Motore
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={restart}
            title="Riavvia"
            className="p-1 rounded text-emerald-400/40 hover:text-emerald-400/80 hover:bg-emerald-400/10 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            title="Chiudi"
            className="p-1 rounded text-emerald-400/40 hover:text-emerald-400/80 hover:bg-emerald-400/10 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Current path breadcrumb */}
      {state.currentPath && !isDone && (
        <div className="flex-shrink-0 px-3 py-1.5 border-b border-[#1a3a2a] bg-[#070d09]">
          <p className="font-mono text-[9px] text-emerald-400/35 uppercase tracking-widest truncate">
            path: {state.currentPath}
          </p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-3">
        {state.messages.map((msg) => {
          if (msg.isResult) {
            return (
              <div key={msg.id} className="flex flex-col items-center gap-2 py-2">
                <div className="w-px h-5 bg-amber-400/20" />
                <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-amber-400/8 border border-amber-400/25 w-full">
                  <CheckCircle2 className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="font-mono text-[9px] text-amber-400/50 uppercase tracking-widest mb-1">
                      Iter selezionato
                    </p>
                    <p className="font-sans text-xs text-amber-200 leading-relaxed">
                      {msg.text}
                    </p>
                    <p className="font-mono text-[9px] text-amber-400/40 mt-1 break-all">
                      {state.selectedPath}
                    </p>
                  </div>
                </div>
              </div>
            );
          }

          if (msg.role === 'agent') {
            return (
              <div key={msg.id} className="flex items-start gap-2">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-400/12 border border-emerald-400/20 flex items-center justify-center mt-0.5">
                  <Bot className="w-3 h-3 text-emerald-400/60" />
                </div>
                <div className="max-w-[82%] px-3 py-2 rounded-lg rounded-tl-sm bg-[#0d1f10] border border-[#1a3a2a]">
                  <p className="font-sans text-xs text-emerald-100/80 leading-relaxed">{msg.text}</p>
                </div>
              </div>
            );
          }

          return (
            <div key={msg.id} className="flex items-end justify-end">
              <div className="max-w-[82%] px-3 py-2 rounded-lg rounded-br-sm bg-emerald-400/15 border border-emerald-400/18">
                <p className="font-sans text-xs text-emerald-200 leading-relaxed">{msg.text}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 px-3 py-2.5 border-t border-[#1a3a2a] bg-[#060c08]">
        {isDone ? (
          <div className="flex items-center justify-center py-0.5">
            <button
              onClick={restart}
              className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-xs text-emerald-400/60 border border-[#1a3a2a] rounded hover:border-emerald-400/40 hover:text-emerald-400/80 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Nuovo test
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="Scrivi la tua risposta…"
              autoFocus
              className="flex-1 bg-[#0a1510] border border-[#1a3a2a] rounded px-3 py-1.5 font-sans text-xs text-emerald-100/85 placeholder-emerald-400/20 focus:outline-none focus:border-emerald-400/40 transition-colors"
            />
            <button
              onClick={submit}
              disabled={!input.trim()}
              className="flex-shrink-0 p-1.5 rounded bg-emerald-400/20 border border-emerald-400/25 text-emerald-400 hover:bg-emerald-400/30 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
