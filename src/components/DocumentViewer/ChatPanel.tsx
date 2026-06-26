import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  AlertCircle,
  BookmarkPlus,
  Braces,
  ChevronDown,
  MessageSquareText,
  Pencil,
  RotateCcw,
  Send,
  X,
} from 'lucide-react';
import type { AgentBundle, AgentSessionState } from '../../lib/agentBundleTypes';
import {
  buildChatTurnDebug,
  shouldAutoExpandTurnDebug,
  type ChatTurnDebug,
} from '../../lib/chatTurnDebug';
import {
  buildUserTurnRecognition,
  formatUserTurnRecognitionSummary,
  resolvePendingDisambiguationContext,
  shouldAutoExpandUserTurnRecognition,
  type UserTurnRecognition,
} from '../../lib/chatUserTurnRecognition';
import { buildChatStuckDiagnosis } from '../../lib/chatStuckDiagnosis';
import { formatTechnicalOptions, isVincoloAskSignature } from '../../lib/disambiguationPlanMessages';
import { deriveDisambiguationParents, type DisambiguationParentInfo } from '../../lib/disambiguationParents';
import { DisambiguationContextSummary } from '../../features/agent/DisambiguationContextSummary';
import {
  buildAnswerContextFromPending,
  describePendingSessionMismatch,
} from '../../lib/pendingDisambiguationAnswerContext';
import { pingVbEngine, postVbTextTurn, type VbTextTurnResponse } from '../../lib/vbTestEngineClient';
import type { SavedChatMessageInput } from '../../lib/savedChatTests';
import { resolveBubbleDisambiguationSignature } from '../../lib/resolveBubbleDisambiguationSignature';

export type OpenDisambiguationMessageHandler = (
  signature: string,
  opts?: { focusGrammar?: boolean },
) => void;

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
  onOpenDisambiguationMessage?: OpenDisambiguationMessageHandler;
  onSaveChat?: (payload: ChatPanelSavePayload) => void;
}

export interface ChatPanelSavePayload {
  messages: SavedChatMessageInput[];
  selectedPath: string | null;
}

type PlanCopyField = 'question' | 'no_match_1' | 'no_match_2' | 'no_match_3';

interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
  isResult?: boolean;
  hintSource?: 'disambiguation_plan' | 'disambiguation_plan_no_match' | 'template';
  disambiguationSignature?: string;
  disambiguationCategory?: string;
  disambiguationOptions?: string[];
  disambiguationParentInfo?: DisambiguationParentInfo;
  disambiguationCandidatePaths?: string[];
  editablePlanField?: PlanCopyField;
  turnDebug?: ChatTurnDebug;
  turnStuckReasons?: string[];
  turnRecognition?: UserTurnRecognition;
}

const CHAT_TEXT = 'text-xs leading-relaxed';

function isPlanBackedHintAction(action: string | undefined): boolean {
  return action === 'disambiguate' || action === 'ask_age';
}

function resolveHintMeta(result: VbTextTurnResponse): {
  hintSource?: ChatMessage['hintSource'];
  editablePlanField?: PlanCopyField;
} {
  const source = result.spokenHintSource;
  const hintSource = isPlanBackedHintAction(result.instruction?.action)
    && (source === 'disambiguation_plan'
      || source === 'disambiguation_plan_no_match'
      || source === 'template')
    ? source
    : undefined;
  const editablePlanField: PlanCopyField | undefined =
    hintSource === 'disambiguation_plan_no_match'
      ? 'no_match_1'
      : hintSource === 'disambiguation_plan'
        ? 'question'
        : undefined;
  return { hintSource, editablePlanField };
}

function resolveDisambiguationOptions(result: VbTextTurnResponse): {
  categoryName?: string;
  options?: string[];
} {
  const action = result.instruction?.action;
  if (action !== 'disambiguate' && action !== 'ask_age') return {};
  const options = (result.instruction?.options ?? [])
    .map((o) => o.trim())
    .filter(Boolean);
  if (options.length === 0) return {};
  const categoryName = result.instruction?.categoryName?.trim();
  return { categoryName: categoryName || undefined, options };
}

function DisambiguationNavButtons({
  signature,
  onOpen,
}: {
  signature: string;
  onOpen?: OpenDisambiguationMessageHandler;
}) {
  if (!onOpen) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      <button
        type="button"
        onClick={() => onOpen(signature, { focusGrammar: false })}
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border border-sky-400/35 bg-sky-400/10 text-sky-200 font-mono ${CHAT_TEXT} hover:bg-sky-400/20 transition-colors`}
      >
        <MessageSquareText className="w-3 h-3 flex-shrink-0" />
        Apri messaggio
      </button>
      <button
        type="button"
        onClick={() => onOpen(signature, { focusGrammar: true })}
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border border-violet-400/35 bg-violet-400/10 text-violet-200 font-mono ${CHAT_TEXT} hover:bg-violet-400/20 transition-colors`}
      >
        <Braces className="w-3 h-3 flex-shrink-0" />
        Apri grammatica
      </button>
    </div>
  );
}

function DisambiguationMetaPanel({
  msg,
  metaLabel,
  metaToneClass,
  onOpenMessage,
}: {
  msg: ChatMessage;
  metaLabel: string;
  metaToneClass: string;
  onOpenMessage?: OpenDisambiguationMessageHandler;
}) {
  const signature = resolveBubbleDisambiguationSignature(msg);

  return (
    <>
      <p className={`font-mono ${CHAT_TEXT} ${metaToneClass}`}>{metaLabel}</p>
      <DisambiguationContextSummary
        categoryName={msg.disambiguationCategory ?? ''}
        parentInfo={msg.disambiguationParentInfo}
        candidatePaths={msg.disambiguationCandidatePaths}
        options={msg.disambiguationOptions}
        signature={signature ?? msg.disambiguationSignature}
        defaultPathsOpen={msg.disambiguationParentInfo?.scope === 'multiple'}
      />
      {signature && <DisambiguationNavButtons signature={signature} onOpen={onOpenMessage} />}
    </>
  );
}

function TurnDebugPanel({
  debug,
  stuckReasons,
}: {
  debug: ChatTurnDebug;
  stuckReasons?: string[];
}) {
  const acquired = debug.acquiredConcepts
    .map((c) => `${c.category}: ${(c.values ?? []).join('+')}`)
    .filter(Boolean);

  return (
    <div className="space-y-2">
      <p className={`font-mono ${CHAT_TEXT} text-amber-300/80`}>{debug.label}</p>

      {stuckReasons && stuckReasons.length > 0 && (
        <div className="rounded border border-amber-400/30 bg-amber-400/8 px-2 py-1.5 space-y-1">
          <p className={`font-mono ${CHAT_TEXT} text-amber-200/90 font-semibold`}>
            Motore in STUCK
          </p>
          <ul className={`font-mono ${CHAT_TEXT} text-amber-100/85 list-disc pl-4 space-y-0.5`}>
            {stuckReasons.map((reason) => (
              <li key={reason} className="break-words">{reason}</li>
            ))}
          </ul>
        </div>
      )}

      <p className={`font-mono ${CHAT_TEXT} text-emerald-400/50`}>
        Candidati: <span className="text-emerald-200/75">{debug.candidateCount}</span>
      </p>

      {acquired.length > 0 && (
        <div>
          <p className={`font-mono ${CHAT_TEXT} text-emerald-400/50`}>Concetti acquisiti:</p>
          <ul className={`mt-0.5 space-y-0.5 font-mono ${CHAT_TEXT} text-emerald-200/75 list-disc pl-4`}>
            {acquired.map((line) => (
              <li key={line} className="break-words">{line}</li>
            ))}
          </ul>
        </div>
      )}

      {debug.parsed.length > 0 && (
        <div>
          <p className={`font-mono ${CHAT_TEXT} text-emerald-400/50`}>Parsato nel turno:</p>
          <ul className={`mt-0.5 space-y-0.5 font-mono ${CHAT_TEXT} text-emerald-200/75 list-disc pl-4`}>
            {debug.parsed.map((p) => (
              <li key={`${p.category}:${p.value}`} className="break-words">
                {p.category}: {p.value}
              </li>
            ))}
          </ul>
        </div>
      )}

      {debug.attributoAnalysis.length > 0 && (
        <div>
          <p className={`font-mono ${CHAT_TEXT} text-emerald-400/50`}>Analisi categorie attributo:</p>
          <ul className={`mt-0.5 space-y-1 font-mono ${CHAT_TEXT} list-none`}>
            {debug.attributoAnalysis.map((row) => (
              <li
                key={row.categoryName}
                className={`rounded border px-2 py-1 ${
                  row.wouldAsk
                    ? 'border-sky-400/35 bg-sky-400/8'
                    : row.acquired
                      ? 'border-emerald-400/20 bg-emerald-400/5'
                      : 'border-[#1a3a2a] bg-[#0a1510]/50'
                }`}
              >
                <span className="text-emerald-200/80">{row.categoryName}</span>
                <span className="text-emerald-400/45">
                  {' · '}
                  {row.acquired
                    ? 'già acquisita'
                    : `${row.distinctSetCount} set distinti`}
                  {row.wouldAsk ? ' · chiederebbe disambiguazione' : ''}
                </span>
                {row.distinctSets.length > 0 && (
                  <ul className="mt-0.5 text-emerald-200/65 list-disc pl-4">
                    {row.distinctSets.map((setKey) => (
                      <li key={setKey} className="break-words">{setKey}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          {!debug.attributoAnalysis.some((r) => r.wouldAsk) && debug.candidateCount > 1 && (
            <p className={`mt-1 font-mono ${CHAT_TEXT} text-amber-300/65`}>
              Nessuna categoria attributo con ≥2 set distinti non ancora acquisita — stato stuck.
            </p>
          )}
        </div>
      )}

      {debug.candidatePaths.length > 0 && (
        <div>
          <p className={`font-mono ${CHAT_TEXT} text-emerald-400/50`}>
            Path candidati ({debug.candidatePaths.length}):
          </p>
          <ul className={`mt-0.5 max-h-36 overflow-y-auto space-y-0.5 font-mono ${CHAT_TEXT} text-emerald-200/65 list-disc pl-4`}>
            {debug.candidatePaths.map((path) => (
              <li key={path} className="break-all">{path}</li>
            ))}
          </ul>
        </div>
      )}

      {debug.debugLog && (
        <p className={`font-mono ${CHAT_TEXT} text-emerald-400/45 break-all`}>
          Log: {debug.debugLog}
        </p>
      )}
      {debug.debugParsedBlock && (
        <pre className={`mt-1 font-mono ${CHAT_TEXT} text-emerald-400/40 whitespace-pre-wrap break-all`}>
          {debug.debugParsedBlock}
        </pre>
      )}
    </div>
  );
}

function UserTurnRecognitionPanel({
  recognition,
  onOpenDisambiguationMessage,
}: {
  recognition: UserTurnRecognition;
  onOpenDisambiguationMessage?: OpenDisambiguationMessageHandler;
}) {
  const summary = formatUserTurnRecognitionSummary(recognition);
  const vbCategoryHit = recognition.vbParsed.find(
    (p) => p.category.toLowerCase() === recognition.categoryName?.toLowerCase(),
  );
  const showPlanRuntimeMismatch = recognition.planOptions
    && recognition.planOptions.length > 0
    && recognition.planOptions.join('\0') !== recognition.options.join('\0');
  const signature = resolveBubbleDisambiguationSignature({
    disambiguationSignature: recognition.signature,
    disambiguationCategory: recognition.categoryName,
    disambiguationOptions: recognition.options,
  });

  return (
    <div className="space-y-2">
      <p className={`font-mono ${CHAT_TEXT} text-sky-300/85`}>
        Riconoscimento: <span className="text-emerald-100/90">{summary}</span>
      </p>

      {recognition.categoryName && (
        <p className={`font-mono ${CHAT_TEXT} text-emerald-400/50`}>
          Categoria attesa: <span className="text-emerald-200/75">{recognition.categoryName}</span>
        </p>
      )}

      {recognition.options.length > 0 && (
        <p className={`font-mono ${CHAT_TEXT} text-emerald-400/50 break-words`}>
          Opzioni: <span className="text-emerald-200/70">{formatTechnicalOptions(recognition.options)}</span>
        </p>
      )}

      {recognition.grammarMatch?.selectedOption && !recognition.grammarMapsToRuntimeToken && (
        <p className={`font-mono ${CHAT_TEXT} text-amber-300/85`}>
          La grammar mappa a «{recognition.grammarMatch.selectedOption}» ma non è un token runtime ammesso.
        </p>
      )}

      {recognition.grammarMatch?.selectedOption && vbCategoryHit && !recognition.aligned && (
        <p className={`font-mono ${CHAT_TEXT} text-amber-300/85`}>
          Grammar client e motore VB hanno scelto opzioni diverse (
          {recognition.grammarMatch.selectedOption} vs {vbCategoryHit.value}).
        </p>
      )}

      {!recognition.pendingWasActive && (
        <p className={`font-mono ${CHAT_TEXT} text-amber-300/85`}>
          Pending disambiguazione assente nello stato inviato al motore.
        </p>
      )}

      {showPlanRuntimeMismatch && (
        <p className={`font-mono ${CHAT_TEXT} text-amber-300/80 break-words`}>
          Piano messaggi: {formatTechnicalOptions(recognition.planOptions!)}
          {' · '}
          Runtime VB: {formatTechnicalOptions(recognition.options)}
        </p>
      )}

      {signature && onOpenDisambiguationMessage && (
        <DisambiguationNavButtons signature={signature} onOpen={onOpenDisambiguationMessage} />
      )}
    </div>
  );
}

function UserMessageBubble({
  msg,
  onOpenDisambiguationMessage,
}: {
  msg: ChatMessage;
  onOpenDisambiguationMessage?: OpenDisambiguationMessageHandler;
}) {
  const recognition = msg.turnRecognition;
  const [open, setOpen] = useState(() => shouldAutoExpandUserTurnRecognition(recognition));
  const hasPanel = !!recognition;

  useEffect(() => {
    if (shouldAutoExpandUserTurnRecognition(recognition)) {
      setOpen(true);
    }
  }, [recognition?.signature, recognition?.grammarMatch?.selectedOption, recognition?.vbParsed.length]);

  if (!hasPanel) {
    return <p className={`font-sans ${CHAT_TEXT} text-emerald-200`}>{msg.text}</p>;
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-1.5 text-left text-emerald-200 hover:text-emerald-100 transition-colors"
        aria-expanded={open}
      >
        <ChevronDown
          className={`w-3 h-3 flex-shrink-0 mt-0.5 transition-transform ${open ? '' : '-rotate-90'}`}
        />
        {(recognition.grammarMatch?.selectedOption && !recognition.grammarMapsToRuntimeToken)
          || !recognition.pendingWasActive
          || (!recognition.grammarMatch?.selectedOption && !recognition.vbParsed.some(
            (p) => p.category.toLowerCase() === recognition.categoryName?.toLowerCase(),
          ))
          || (recognition.grammarMatch?.selectedOption && !recognition.aligned) ? (
          <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5 text-amber-400/80" aria-hidden />
        ) : null}
        <span className={`font-sans ${CHAT_TEXT} flex-1 min-w-0`}>{msg.text}</span>
      </button>
      {open && recognition && (
        <div className="mt-2 pt-2 border-t border-emerald-400/15 pl-[18px]">
          <UserTurnRecognitionPanel
            recognition={recognition}
            onOpenDisambiguationMessage={onOpenDisambiguationMessage}
          />
        </div>
      )}
    </div>
  );
}

function AgentMessageBubble({
  msg,
  onSave,
  onOpenDisambiguationMessage,
}: {
  msg: ChatMessage;
  onSave: (text: string) => void;
  onOpenDisambiguationMessage?: OpenDisambiguationMessageHandler;
}) {
  const [open, setOpen] = useState(() => shouldAutoExpandTurnDebug(msg.turnDebug));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(msg.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canEdit = !!msg.disambiguationSignature
    && (msg.hintSource === 'disambiguation_plan' || msg.hintSource === 'disambiguation_plan_no_match');
  const hasDisambiguationMeta = !!msg.hintSource;
  const hasTurnDebug = !!msg.turnDebug;
  const hasExpandablePanel = hasDisambiguationMeta || hasTurnDebug;
  const isPersonalized = msg.hintSource === 'disambiguation_plan'
    || msg.hintSource === 'disambiguation_plan_no_match';
  const isVincoloAsk = !!msg.disambiguationSignature && isVincoloAskSignature(msg.disambiguationSignature);
  const metaLabel = msg.hintSource === 'disambiguation_plan'
    ? (isVincoloAsk ? 'Vincolo personalizzato' : 'Disambiguazione personalizzata')
    : msg.hintSource === 'disambiguation_plan_no_match'
      ? (isVincoloAsk ? 'Re-prompt vincolo' : 'Re-prompt personalizzato')
      : (isVincoloAsk ? 'Template VB (domanda età)' : 'Template VB');
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

  const startEditing = () => {
    setOpen(true);
    setEditing(true);
  };

  if (editing) {
    return (
      <div className="w-full space-y-2">
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
        {hasExpandablePanel && (
          <div className="pt-2 border-t border-[#1a3a2a]/80 pl-[18px]">
            {hasDisambiguationMeta && (
              <DisambiguationMetaPanel
                msg={msg}
                metaLabel={metaLabel}
                metaToneClass={metaToneClass}
                onOpenMessage={onOpenDisambiguationMessage}
              />
            )}
            {hasTurnDebug && msg.turnDebug && (
              <div className={hasDisambiguationMeta ? 'mt-2 pt-2 border-t border-[#1a3a2a]/60' : ''}>
                <TurnDebugPanel debug={msg.turnDebug} stuckReasons={msg.turnStuckReasons} />
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (hasExpandablePanel) {
    return (
      <div className="group relative w-full">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-start gap-1.5 text-left text-emerald-100/85 hover:text-emerald-100 transition-colors"
          aria-expanded={open}
        >
          <ChevronDown
            className={`w-3 h-3 flex-shrink-0 mt-0.5 transition-transform ${open ? '' : '-rotate-90'}`}
          />
          {hasTurnDebug ? (
            <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5 text-amber-400/80" aria-hidden />
          ) : isPersonalized ? (
            <MessageSquareText className="w-3 h-3 flex-shrink-0 mt-0.5 text-sky-400/80" aria-hidden />
          ) : null}
          <span className={`font-sans ${CHAT_TEXT} flex-1 min-w-0`}>{msg.text}</span>
        </button>
        {canEdit && (
          <button
            type="button"
            onClick={startEditing}
            title="Modifica messaggio nel piano disambiguazione"
            className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 p-1 rounded bg-[#0a1510] border border-emerald-400/30 text-emerald-400/70 hover:text-emerald-300 transition-opacity"
          >
            <Pencil className="w-3 h-3" />
          </button>
        )}
        {open && (
          <div className="mt-2 pt-2 border-t border-[#1a3a2a]/80 pl-[18px]">
            {hasDisambiguationMeta && (
              <DisambiguationMetaPanel
                msg={msg}
                metaLabel={metaLabel}
                metaToneClass={metaToneClass}
                onOpenMessage={onOpenDisambiguationMessage}
              />
            )}
            {hasTurnDebug && msg.turnDebug && (
              <div className={hasDisambiguationMeta ? 'mt-2 pt-2 border-t border-[#1a3a2a]/60' : ''}>
                <TurnDebugPanel debug={msg.turnDebug} stuckReasons={msg.turnStuckReasons} />
              </div>
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

function ChatMessageList({
  messages,
  selectedPath,
  onPatchDisambiguationMessage,
  onAgentMessageSave,
  onOpenDisambiguationMessage,
}: {
  messages: readonly ChatMessage[];
  selectedPath?: string | null;
  onPatchDisambiguationMessage?: (patch: DisambiguationPlanMessagePatch) => void;
  /** Live chat: patch plan + update local bubble text. */
  onAgentMessageSave?: (msg: ChatMessage, text: string) => void;
  onOpenDisambiguationMessage?: OpenDisambiguationMessageHandler;
}) {
  const handleAgentSave = useCallback((msg: ChatMessage, newText: string) => {
    if (onAgentMessageSave) {
      onAgentMessageSave(msg, newText);
      return;
    }
    if (!onPatchDisambiguationMessage) return;
    const signature = resolveBubbleDisambiguationSignature(msg);
    if (!signature) return;
    const field = msg.editablePlanField ?? 'question';
    onPatchDisambiguationMessage({
      signature,
      [field]: newText,
    });
  }, [onAgentMessageSave, onPatchDisambiguationMessage]);

  return (
    <>
      {messages.map((msg) => {
        if (msg.isResult) {
          const path = selectedPath ?? null;
          return (
            <div key={msg.id} className="flex flex-col items-center gap-2 py-2">
              <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-amber-400/8 border border-amber-400/25 w-full">
                <CheckCircle2 className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className={`font-sans ${CHAT_TEXT} text-amber-200`}>{msg.text}</p>
                  {path && (
                    <p className={`font-mono ${CHAT_TEXT} text-amber-400/50 mt-1 break-all`}>{path}</p>
                  )}
                </div>
              </div>
            </div>
          );
        }
        if (msg.role === 'agent') {
          return (
            <div key={msg.id} className="flex w-full items-start gap-2">
              <div className="w-full max-w-[92%] px-3 py-2 rounded-lg bg-[#0d1f10] border border-[#1a3a2a]">
                <AgentMessageBubble
                  msg={msg}
                  onSave={(text) => handleAgentSave(msg, text)}
                  onOpenDisambiguationMessage={onOpenDisambiguationMessage}
                />
              </div>
            </div>
          );
        }
        return (
          <div key={msg.id} className="flex justify-end">
            <div className="max-w-[92%] px-3 py-2 rounded-lg bg-emerald-400/15 border border-emerald-400/18">
              <UserMessageBubble
                msg={msg}
                onOpenDisambiguationMessage={onOpenDisambiguationMessage}
              />
            </div>
          </div>
        );
      })}
    </>
  );
}

/** Read-only replay of a saved chat with the same interactive panels as the live test rail. */
export function ChatMessageReplay({
  messages,
  selectedPath,
  onPatchDisambiguationMessage,
  onOpenDisambiguationMessage,
}: {
  messages: readonly SavedChatMessageInput[];
  selectedPath?: string | null;
  onPatchDisambiguationMessage?: (patch: DisambiguationPlanMessagePatch) => void;
  onOpenDisambiguationMessage?: OpenDisambiguationMessageHandler;
}) {
  const chatMessages = useMemo((): ChatMessage[] => (
    messages.map((msg, index) => {
      const signature = resolveBubbleDisambiguationSignature(msg);
      return {
        id: String(index),
        role: msg.role,
        text: msg.text,
        isResult: msg.isResult,
        hintSource: msg.hintSource as ChatMessage['hintSource'],
        disambiguationSignature: signature ?? msg.disambiguationSignature,
        disambiguationCategory: msg.disambiguationCategory,
        disambiguationOptions: msg.disambiguationOptions,
        editablePlanField: msg.editablePlanField,
        turnStuckReasons: msg.turnStuckReasons,
        turnRecognition: msg.turnRecognition
          ? {
            ...msg.turnRecognition,
            signature: msg.turnRecognition.signature ?? signature ?? undefined,
          }
          : undefined,
        turnDebug: msg.turnDebug,
      };
    })
  ), [messages]);

  return (
    <div className="px-2 py-3 space-y-3">
      <ChatMessageList
        messages={chatMessages}
        selectedPath={selectedPath}
        onPatchDisambiguationMessage={onPatchDisambiguationMessage}
        onOpenDisambiguationMessage={onOpenDisambiguationMessage}
      />
    </div>
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
        text: 'Imposta la Domanda di apertura nel pannello Messaggi (sezione globale in alto), poi salva.',
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
  onOpenDisambiguationMessage,
  onSaveChat,
}: ChatPanelProps) {
  const [state, setState] = useState<ChatUiState>(() => (
    agentBundle ? initChatState(agentBundle) : { messages: [], selectedPath: null, candidatePaths: null }
  ));
  const [vbSession, setVbSession] = useState<AgentSessionState | null>(null);
  const [vbOnline, setVbOnline] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');
  const [saveFlash, setSaveFlash] = useState(false);
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
    setSaveFlash(false);
  }, [agentBundle]);

  const saveChat = useCallback(() => {
    if (!onSaveChat || state.messages.length === 0) return;
    const payload: ChatPanelSavePayload = {
      messages: state.messages.map((msg) => ({
        role: msg.role,
        text: msg.text,
        isResult: msg.isResult,
        hintSource: msg.hintSource,
        disambiguationSignature: msg.disambiguationSignature,
        disambiguationCategory: msg.disambiguationCategory,
        disambiguationOptions: msg.disambiguationOptions,
        editablePlanField: msg.editablePlanField,
        turnStuckReasons: msg.turnStuckReasons,
        turnRecognition: msg.turnRecognition,
        turnDebug: msg.turnDebug,
      })),
      selectedPath: state.selectedPath,
    };
    onSaveChat(payload);
    setSaveFlash(true);
  }, [onSaveChat, state.messages, state.selectedPath]);

  const handlePatchMessage = useCallback((msg: ChatMessage, newText: string) => {
    const signature = resolveBubbleDisambiguationSignature(msg);
    if (!signature || !onPatchDisambiguationMessage) return;
    const field = msg.editablePlanField ?? 'question';
    onPatchDisambiguationMessage({
      signature,
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

    const pendingContext = resolvePendingDisambiguationContext(state.messages);
    const answerContext = buildAnswerContextFromPending(pendingContext);
    const sessionPendingMismatch = describePendingSessionMismatch(vbSession, answerContext);

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
        answerContext,
      });

      const nextState = result.nextState ?? null;
      setVbSession(nextState);

      const spoken = result.spokenHint?.trim() ?? '';
      const selectedPath = result.selectedPath ?? nextState?.selectedPath ?? null;
      const isConfirm = result.instruction?.action === 'confirm' && !!selectedPath;
      const { hintSource, editablePlanField } = resolveHintMeta(result);
      const { categoryName: disambiguationCategory, options: disambiguationOptions } =
        resolveDisambiguationOptions(result);
      const disambiguationParentInfo = disambiguationCategory
        && (result.candidatePaths?.length ?? 0) > 0
        ? deriveDisambiguationParents(
          disambiguationCategory,
          result.candidatePaths ?? [],
          agentBundle.dictionary.categories ?? [],
        )
        : undefined;
      const disambiguationCandidatePaths = (result.candidatePaths ?? [])
        .map((p) => p.trim())
        .filter(Boolean);
      const turnDebug = buildChatTurnDebug(result, agentBundle);
      const turnRecognition = buildUserTurnRecognition({
        userText: trimmed,
        bundle: agentBundle,
        vbParsed: result.parsed,
        pending: pendingContext,
        priorSession: vbSession,
      });

      let turnStuckReasons: string[] | undefined;
      if (result.instruction?.action === 'no_match' && turnRecognition) {
        turnStuckReasons = buildChatStuckDiagnosis({
          recognition: turnRecognition,
          priorSession: vbSession,
          vbResult: result,
          planOptions: turnRecognition.planOptions,
        }).reasons;
        if (sessionPendingMismatch) {
          turnStuckReasons = [sessionPendingMismatch, ...turnStuckReasons];
        }
      }

      setState((prev) => {
        const nextMessages = [...prev.messages];
        const lastUserIdx = nextMessages.length - 1;
        if (lastUserIdx >= 0 && nextMessages[lastUserIdx].role === 'user') {
          nextMessages[lastUserIdx] = {
            ...nextMessages[lastUserIdx],
            turnRecognition,
          };
        }
        if (spoken) {
          nextMessages.push({
            id: nextMsgId(),
            role: 'agent',
            text: spoken,
            isResult: isConfirm,
            hintSource,
            disambiguationSignature: result.disambiguationSignature,
            disambiguationCategory,
            disambiguationOptions,
            disambiguationParentInfo,
            disambiguationCandidatePaths: disambiguationCandidatePaths.length > 0
              ? disambiguationCandidatePaths
              : undefined,
            editablePlanField,
            turnDebug,
            turnStuckReasons: turnStuckReasons?.length ? turnStuckReasons : undefined,
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
      const unreachable = /Failed to fetch|NetworkError|fetch failed/i.test(message)
        || /VB engine HTTP (5\d\d|0)/i.test(message);
      const agentText = message.includes('[convertAgentBundleToVb]')
        ? message
        : unreachable
          ? `Motore VB non raggiungibile: ${message}. Avvia DialogEngine.Api (porta 5190).`
          : `Errore motore VB: ${message}`;
      setState((prev) => ({
        ...prev,
        messages: [
          ...prev.messages,
          {
            id: nextMsgId(),
            role: 'agent',
            text: agentText,
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
          {onSaveChat && (
            <button
              type="button"
              onClick={saveChat}
              disabled={state.messages.length === 0 || loading}
              title={saveFlash ? 'Chat salvata' : 'Salva chat nei test'}
              className={`p-1 rounded transition-colors disabled:opacity-40 ${
                saveFlash
                  ? 'text-emerald-300 bg-emerald-400/15'
                  : 'text-emerald-400/40 hover:text-emerald-400/80 hover:bg-emerald-400/10'
              }`}
            >
              <BookmarkPlus className="w-3.5 h-3.5" />
            </button>
          )}
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
        <ChatMessageList
          messages={state.messages}
          selectedPath={state.selectedPath}
          onAgentMessageSave={handlePatchMessage}
          onOpenDisambiguationMessage={onOpenDisambiguationMessage}
        />
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
