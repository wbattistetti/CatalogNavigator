/**
 * Single contextual toolbar for the active editor tab.
 */
import {
  BookOpen, Braces, Filter, FlaskConical, Loader2, MessageSquare,
  RotateCcw, Save, Wand2, X,
} from 'lucide-react';
import { useDocumentEditor } from './DocumentEditorContext';
import { EDITOR_TAB_IDS } from './editorTabIds';

export function DocumentEditorToolbar() {
  const {
    doc,
    content,
    dictionaryMode,
    documentText,
    analysisApi,
    activeTab,
    setActiveTab,
    dictState,
    setAffinaOpen,
    testOpen,
    setTestOpen,
    grammarOverwrite,
    setGrammarOverwrite,
    showOnlyMessageNodes,
    setShowOnlyMessageNodes,
    grammarTokens,
    dicts,
  } = useDocumentEditor();

  const {
    generating, generatingPhase, analysis,
    generateMessagesFromDictionary, generateMessagesFromText, generateGrammars, generateGrammarsWithAi,
    saveAnalysis, discardAnalysisChanges, cancelGeneration,
    saving, analysisDirty, hasMessages, agentReady, hasTaxonomy,
    missingGrammarCount,
  } = analysisApi;

  if (activeTab === EDITOR_TAB_IDS.ontology && dictionaryMode) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void dictState?.save()}
          disabled={!dictState?.canSave}
          className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-xs font-semibold text-emerald-900 bg-sky-400 rounded hover:bg-sky-300 transition-colors disabled:opacity-40"
        >
          <Save className="w-3.5 h-3.5" />
          Salva dizionario
        </button>
        {dictState?.dirty && (
          <button
            type="button"
            onClick={() => dictState.discard()}
            className="flex items-center gap-1 px-2 py-1.5 font-mono text-[10px] text-emerald-400/60 border border-[#1a3a2a] rounded hover:border-emerald-400/30 hover:text-emerald-400/90 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Annulla
          </button>
        )}
      </div>
    );
  }

  if (activeTab === EDITOR_TAB_IDS.dictionaries && dictionaryMode) {
    const activeId = dicts.editingDictionaryId;
    const session = activeId ? dicts.getSession(activeId) : null;
    const canSave = !!session?.dirty && !!activeId;

    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (!activeId) return;
            void dicts.saveDictionary(activeId);
          }}
          disabled={!canSave}
          className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-xs font-semibold text-emerald-900 bg-sky-400 rounded hover:bg-sky-300 transition-colors disabled:opacity-40"
        >
          <Save className="w-3.5 h-3.5" />
          Salva dizionario
        </button>
        {session?.dirty && activeId && (
          <button
            type="button"
            onClick={() => dicts.discardDictionary(activeId)}
            className="flex items-center gap-1 px-2 py-1.5 font-mono text-[10px] text-emerald-400/60 border border-[#1a3a2a] rounded hover:border-emerald-400/30 hover:text-emerald-400/90 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Annulla
          </button>
        )}
      </div>
    );
  }

  if (activeTab === EDITOR_TAB_IDS.agent) {
    const hasData = (analysis?.rows.length ?? 0) > 0;
    const canGenerateMessages = dictionaryMode
      ? (dictState?.activeTokenCount ?? 0) > 0 && !generating
      : !!documentText && !generating;
    const canRunGrammarGeneration = hasTaxonomy && !generating
      && (grammarOverwrite || missingGrammarCount > 0);

    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              const contextText = documentText ?? '';
              if (dictionaryMode) {
                const d = dictState?.getMergedDictionary?.() ?? dictState?.getDictionary();
                const descriptions = dictState?.getDescriptions() ?? [];
                if (!d || dictState!.activeTokenCount === 0) return;
                void generateMessagesFromDictionary(d, descriptions, doc.name, contextText).catch(() => {});
              } else if (documentText) {
                void generateMessagesFromText(documentText, doc.name).catch(() => {});
              }
            }}
            disabled={!canGenerateMessages}
            className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-xs font-semibold text-emerald-900 bg-emerald-400 rounded hover:bg-emerald-300 transition-colors disabled:opacity-40"
          >
            {generating && (generatingPhase === 'taxonomy' || generatingPhase === 'messages')
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <MessageSquare className="w-3.5 h-3.5" />}
            {generating
              ? generatingPhase === 'taxonomy'
                ? 'Costruisco albero…'
                : generatingPhase === 'messages'
                  ? 'Genero messaggi…'
                  : 'Genera messaggi'
              : 'Genera messaggi'}
          </button>
          <button
            type="button"
            onClick={() => setShowOnlyMessageNodes((v) => !v)}
            disabled={!hasTaxonomy}
            className={`flex items-center gap-1 px-2 py-1.5 font-mono text-[10px] rounded border transition-colors disabled:opacity-40 ${
              showOnlyMessageNodes
                ? 'text-amber-300 border-amber-400/40 bg-amber-400/10'
                : 'text-emerald-400/50 border-[#1a3a2a] hover:border-emerald-400/30 hover:text-emerald-400/80'
            }`}
          >
            <Filter className="w-3 h-3" />
            Solo messaggi
          </button>
          <button
            type="button"
            onClick={() => {
              if (!hasTaxonomy) return;
              const overwrite = grammarOverwrite;
              void generateGrammars(grammarTokens, documentText ?? '', doc.name, overwrite)
                .then((nextTokens) => {
                  dictState?.replaceTokens(nextTokens);
                  if (overwrite) setGrammarOverwrite(false);
                }).catch(() => {});
            }}
            disabled={!canRunGrammarGeneration}
            className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-xs font-semibold text-emerald-900 bg-sky-400 rounded hover:bg-sky-300 transition-colors disabled:opacity-40"
          >
            {generating && generatingPhase === 'grammars'
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Braces className="w-3.5 h-3.5" />}
            {grammarOverwrite
              ? 'Rigenera tutte'
              : missingGrammarCount > 0
                ? `Genera mancanti (${missingGrammarCount})`
                : 'Genera grammatiche'}
          </button>
          <button
            type="button"
            onClick={() => void (async () => {
              const overwrite = grammarOverwrite;
              try {
                await generateGrammarsWithAi(documentText ?? '', doc.name, overwrite);
                if (overwrite) setGrammarOverwrite(false);
              } catch { /* error in hook */ }
            })()}
            disabled={!canRunGrammarGeneration}
            className="flex items-center gap-1 px-2 py-1.5 font-mono text-[10px] rounded border border-violet-400/30 text-violet-300/80 hover:bg-violet-400/10 transition-colors disabled:opacity-40"
          >
            {generating && generatingPhase === 'grammars' ? 'IA…' : 'IA'}
          </button>
          <button
            type="button"
            onClick={() => setGrammarOverwrite((v) => !v)}
            disabled={!hasTaxonomy || generating}
            aria-pressed={grammarOverwrite}
            className={`flex items-center justify-center w-7 h-7 rounded border transition-colors disabled:opacity-40 ${
              grammarOverwrite
                ? 'border-amber-400/50 bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/40'
                : 'border-[#1a3a2a] text-emerald-400/40 hover:border-emerald-400/30 hover:text-emerald-400/70'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          {generating && (
            <button
              type="button"
              onClick={cancelGeneration}
              className="flex items-center justify-center w-7 h-7 rounded border border-red-400/40 bg-red-400/10 text-red-400/80 hover:bg-red-400/20 hover:text-red-300 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {hasData && (
          <>
            <button
              type="button"
              onClick={() => void saveAnalysis()}
              disabled={!analysisDirty || saving || generating}
              className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-xs font-semibold text-emerald-900 bg-sky-400 rounded hover:bg-sky-300 transition-colors disabled:opacity-40"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? 'Salvataggio…' : 'Salva analisi'}
            </button>
            {analysisDirty && (
              <button
                type="button"
                onClick={() => void discardAnalysisChanges()}
                disabled={saving || generating}
                className="flex items-center gap-1 px-2 py-1.5 font-mono text-[10px] text-emerald-400/60 border border-[#1a3a2a] rounded hover:border-emerald-400/30 hover:text-emerald-400/90 transition-colors disabled:opacity-30"
              >
                <RotateCcw className="w-3 h-3" />
                Annulla
              </button>
            )}
            <button
              type="button"
              onClick={() => setAffinaOpen((v) => !v)}
              disabled={generating}
              className="flex items-center gap-1 px-2 py-1.5 font-mono text-[10px] text-amber-400/60 border border-amber-400/25 rounded hover:border-amber-400/50 hover:text-amber-400/90 transition-colors disabled:opacity-30"
            >
              <Wand2 className="w-3 h-3" />
              Affina
            </button>
            {hasMessages && (
              <button
                type="button"
                onClick={() => setTestOpen((v) => !v)}
                className={`flex items-center gap-1 px-2 py-1.5 font-mono text-[10px] border rounded transition-colors ${
                  testOpen
                    ? 'text-emerald-300 border-emerald-400/50 bg-emerald-400/10'
                    : agentReady
                      ? 'text-emerald-400/60 border-emerald-400/25 hover:border-emerald-400/50 hover:text-emerald-400/90'
                      : 'text-amber-400/60 border-amber-400/25 hover:border-amber-400/50 hover:text-amber-400/90'
                }`}
              >
                <FlaskConical className="w-3 h-3" />
                Test
              </button>
            )}
          </>
        )}
      </div>
    );
  }

  if (dictionaryMode && activeTab === EDITOR_TAB_IDS.document) {
    return (
      <button
        type="button"
        onClick={() => setActiveTab(EDITOR_TAB_IDS.ontology)}
        disabled={content.loading || !content.tabular}
        className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-xs font-semibold text-emerald-900 bg-amber-400 rounded hover:bg-amber-300 transition-colors disabled:opacity-40"
      >
        <BookOpen className="w-3 h-3" />
        Ontologia
      </button>
    );
  }

  return null;
}
