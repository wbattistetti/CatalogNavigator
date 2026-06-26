/**
 * Grid of saved manual VB chat tests — collapsible accordions with interactive replay.
 */
import { useCallback, useState } from 'react';
import { Bookmark, ChevronDown, Trash2 } from 'lucide-react';
import {
  ChatMessageReplay,
  type DisambiguationPlanMessagePatch,
  type OpenDisambiguationMessageHandler,
} from '../../components/DocumentViewer/ChatPanel';
import { patchDisambiguationPlanMessage } from '../../lib/disambiguationPlanMessages';
import { resolveSavedChatMessages, type SavedChatTest } from '../../lib/savedChatTests';
import { useDocumentEditorController } from '../document-editor/DocumentEditorContext';

function SavedChatAccordion({
  test,
  startQuestion,
  onRemove,
  onPatchDisambiguationMessage,
  onOpenDisambiguationMessage,
}: {
  test: SavedChatTest;
  startQuestion?: string;
  onRemove: () => void;
  onPatchDisambiguationMessage: (patch: DisambiguationPlanMessagePatch) => void;
  onOpenDisambiguationMessage: OpenDisambiguationMessageHandler;
}) {
  const [open, setOpen] = useState(false);
  const savedLabel = new Date(test.savedAt).toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const messages = resolveSavedChatMessages(test, startQuestion);

  return (
    <article className="rounded-lg border border-emerald-400/25 bg-[#0a0f0c] overflow-hidden">
      <div className="flex items-start gap-1 border-b border-emerald-400/15 bg-[#0d1812]">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 min-w-0 items-start gap-2 px-3 py-2.5 text-left hover:bg-emerald-400/5 transition-colors"
          aria-expanded={open}
        >
          <ChevronDown
            className={`w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-400 transition-transform ${open ? '' : '-rotate-90'}`}
          />
          <div className="min-w-0 flex-1">
            <h3 className="font-mono text-xs font-semibold text-emerald-50 break-words" title={test.title}>
              {test.title}
            </h3>
            <p className="font-mono text-[10px] text-emerald-400/45 mt-0.5">{savedLabel}</p>
          </div>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title="Rimuovi test salvato"
          className="p-2 m-1 rounded text-emerald-400/40 hover:text-red-300 hover:bg-red-400/10 transition-colors flex-shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {open && (
        <div className="border-t border-emerald-400/10 bg-[#060c08]/40">
          <ChatMessageReplay
            messages={messages}
            selectedPath={test.finalPath}
            onPatchDisambiguationMessage={onPatchDisambiguationMessage}
            onOpenDisambiguationMessage={onOpenDisambiguationMessage}
          />
        </div>
      )}
    </article>
  );
}

export function SavedChatTestsWorkspace() {
  const { analysisApi, openDisambiguationMessage } = useDocumentEditorController();
  const { savedChatTests, removeSavedChatTest, hasTaxonomy, analysis, updateDisambiguationPlan } = analysisApi;
  const startQuestion = analysis?.start_question?.trim() || undefined;

  const onPatchDisambiguationMessage = useCallback((patch: DisambiguationPlanMessagePatch) => {
    const { signature, ...fields } = patch;
    const next = patchDisambiguationPlanMessage(analysis?.disambiguation_plan, signature, fields);
    updateDisambiguationPlan(next);
  }, [analysis?.disambiguation_plan, updateDisambiguationPlan]);

  const onOpenDisambiguationFromChat = useCallback((
    signature: string,
    opts?: { focusGrammar?: boolean },
  ) => {
    openDisambiguationMessage(signature, opts ?? { focusGrammar: true });
  }, [openDisambiguationMessage]);

  if (!hasTaxonomy && savedChatTests.length === 0) {
    return (
      <div className="flex flex-1 min-h-0 items-center justify-center text-emerald-400/30 font-mono text-sm px-8 text-center bg-[#0a0f0c]">
        Genera l&apos;ontologia e salva chat dal pannello Test Motore VB.
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden bg-[#0a0f0c]">
      <header className="flex-shrink-0 px-5 py-4 border-b border-emerald-400/25 bg-[#0d1812]">
        <div className="flex items-start gap-3">
          <Bookmark className="w-6 h-6 text-emerald-300 flex-shrink-0 mt-0.5" />
          <div className="min-w-0 space-y-1">
            <h2 className="font-mono text-base font-bold text-emerald-50 uppercase tracking-wide">
              Test chat salvati
            </h2>
            <p className="font-mono text-sm text-emerald-200/80 leading-relaxed max-w-3xl">
              Espandi una sessione per rivederla. Clic sui messaggi per correggere copy o aprire
              messaggi e grammatiche nel pannello disambiguazione.
            </p>
            <span className="inline-flex px-2 py-0.5 rounded border border-emerald-400/30 font-mono text-xs text-emerald-100">
              {savedChatTests.length} salvati
            </span>
          </div>
        </div>
      </header>

      {savedChatTests.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-emerald-400/30 font-mono text-sm px-8 text-center">
          Nessuna chat salvata. Apri Test Motore VB, completa un dialogo e premi Save.
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 items-start">
            {savedChatTests.map((test) => (
              <SavedChatAccordion
                key={test.id}
                test={test}
                startQuestion={startQuestion}
                onRemove={() => removeSavedChatTest(test.id)}
                onPatchDisambiguationMessage={onPatchDisambiguationMessage}
                onOpenDisambiguationMessage={onOpenDisambiguationFromChat}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
