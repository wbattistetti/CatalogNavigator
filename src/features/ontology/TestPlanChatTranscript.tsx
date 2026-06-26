/**
 * Read-only chat bubbles for Test Plan script columns (ChatPanel-style metadata).
 */
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import {
  buildTestPlanChatMessages,
  type TestPlanChatMessage,
} from '../../lib/dialogTestPlan/dialogTestPlanChatMessages';
import { formatTechnicalOptions } from '../../lib/disambiguationPlanMessages';
import type { DialogTestTurnRecord } from '../../lib/dialogTestPlan/dialogTestPlanTypes';

const CHAT_TEXT = 'text-xs leading-relaxed';

function ResultBubble({ msg }: { msg: TestPlanChatMessage }) {
  return (
    <div className="flex flex-col items-center gap-2 py-1 w-full">
      <div className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-amber-400/8 border border-amber-400/25 w-full">
        <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className={`font-sans ${CHAT_TEXT} text-amber-200`}>{msg.text}</p>
          {msg.resultPath && (
            <p className={`font-mono ${CHAT_TEXT} text-amber-400/50 mt-1 break-all`}>{msg.resultPath}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function AgentBubble({ msg }: { msg: TestPlanChatMessage }) {
  const hasOptions = (msg.disambiguationOptions?.length ?? 0) > 0;
  const hasStuck = (msg.turnStuckReasons?.length ?? 0) > 0;

  return (
    <div className="flex w-full items-start gap-2">
      <div className="w-full max-w-[95%] px-2.5 py-2 rounded-lg bg-[#0d1f10] border border-[#1a3a2a] space-y-1.5">
        <p className={`font-sans ${CHAT_TEXT} text-emerald-100/85`}>{msg.text}</p>
        {hasOptions && (
          <div className="pt-1 border-t border-[#1a3a2a]/80">
            {msg.disambiguationCategory && (
              <p className={`font-mono ${CHAT_TEXT} text-sky-300/70 mb-1`}>
                {msg.disambiguationCategory}
              </p>
            )}
            <p className={`font-mono ${CHAT_TEXT} text-emerald-400/60 break-words`}>
              {formatTechnicalOptions(msg.disambiguationOptions!)}
            </p>
          </div>
        )}
        {hasStuck && (
          <div className="flex items-start gap-1 pt-1 border-t border-amber-400/20">
            <AlertCircle className="w-3 h-3 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className={`font-mono ${CHAT_TEXT} text-amber-300/85`}>
              {msg.turnStuckReasons!.join(' · ')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function UserBubble({ text, preview, warning }: { text: string; preview?: boolean; warning?: boolean }) {
  return (
    <div className="flex justify-end w-full">
      <div
        className={`max-w-[95%] px-2.5 py-2 rounded-lg border ${
          preview
            ? 'bg-emerald-400/8 border-emerald-400/25 border-dashed opacity-70'
            : 'bg-emerald-400/15 border-emerald-400/18'
        }`}
      >
        <div className="flex items-start gap-1">
          {warning && !preview && (
            <AlertCircle className="w-3 h-3 text-amber-400 flex-shrink-0 mt-0.5" aria-hidden />
          )}
          <p className={`font-sans ${CHAT_TEXT} text-emerald-200`}>{text}</p>
        </div>
      </div>
    </div>
  );
}

export function TestPlanChatTranscript({
  startQuestion,
  transcript,
  plannedUserSteps,
  finalPath,
  running,
  emptyHint,
  variant = 'compact',
}: {
  startQuestion?: string;
  transcript: readonly DialogTestTurnRecord[];
  plannedUserSteps?: readonly string[];
  finalPath?: string | null;
  running?: boolean;
  emptyHint?: string;
  /** compact: scrollable column in Test Plan; full: entire transcript visible (saved chats grid). */
  variant?: 'compact' | 'full';
}) {
  const hasLive = transcript.length > 0 || running;
  const messages = buildTestPlanChatMessages(startQuestion, transcript, finalPath);
  const showPreview = !hasLive && (plannedUserSteps?.length ?? 0) > 0;

  if (messages.length === 0 && !showPreview && !running) {
    return (
      <p className={`px-2.5 py-3 font-mono ${CHAT_TEXT} text-emerald-400/40 text-center`}>
        {emptyHint ?? 'Premi ▶ per avviare il dialogo.'}
      </p>
    );
  }

  const containerClass = variant === 'full'
    ? 'flex flex-col px-2 py-2 space-y-2 bg-[#060c08]/60'
    : 'flex flex-col min-h-[140px] max-h-[280px] overflow-y-auto px-2 py-2 space-y-2 bg-[#060c08]/60';

  return (
    <div className={containerClass}>
      {messages.map((msg) => {
        if (msg.isResult) {
          return <ResultBubble key={msg.id} msg={msg} />;
        }
        if (msg.role === 'agent') {
          return <AgentBubble key={msg.id} msg={msg} />;
        }
        return (
          <UserBubble
            key={msg.id}
            text={msg.text}
            warning={msg.hasRecognitionWarning}
          />
        );
      })}
      {showPreview && plannedUserSteps!.map((step, i) => (
        <UserBubble key={`plan-${i}`} text={step} preview />
      ))}
      {running && (
        <div className="flex items-center gap-1.5 px-2 py-1 text-sky-300/80">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span className={`font-mono ${CHAT_TEXT}`}>Elaborazione…</span>
        </div>
      )}
    </div>
  );
}
