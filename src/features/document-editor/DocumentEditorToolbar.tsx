/**
 * Single contextual toolbar for the active editor tab.
 */
import {
  BookOpen, Braces, FlaskConical, Loader2, MessageSquare, Mic,
  RefreshCw, RotateCcw, Save, Wand2, X,
} from 'lucide-react';
import { useDocumentEditorController, useDocumentEditorTab } from './DocumentEditorContext';
import { EDITOR_TAB_IDS } from './editorTabIds';
import { findCategoriesMissingGrammar } from '../../lib/categoryGrammar';

export function DocumentEditorToolbar() {
  const {
    doc,
    content,
    dictionaryMode,
    documentText,
    analysisApi,
    dictState,
    setAffinaOpen,
    testOpen,
    setTestOpen,
    convaiOpen,
    setConvaiOpen,
    convaiNoBeOpen,
    setConvaiNoBeOpen,
    dicts,
    agentDictionaryContext,
    agentNeedsUpdate,
    canRefreshOntology,
    refreshOntology,
    buildLiveLoadedRefs,
  } = useDocumentEditorController();
  const { activeTab, setActiveTab } = useDocumentEditorTab();

  const {
    generating, generatingPhase, analysis,
    generateMessagesFromDictionary, generateMessagesFromText,
    generateDictionaryCategoryGrammars,
    saveAnalysis, discardAnalysisChanges, cancelGeneration,
    saving, analysisDirty, hasMessages, agentReady, hasTaxonomy,
  } = analysisApi;

  if (activeTab === EDITOR_TAB_IDS.ontology && dictionaryMode) {

    return (
      <div className="flex flex-wrap items-center gap-2 flex-shrink-0 justify-end">
        {canRefreshOntology && (
          <button
            type="button"
            onClick={refreshOntology}
            className={`flex items-center gap-1.5 px-3 py-1.5 font-mono text-sm font-semibold rounded transition-colors ${
              agentNeedsUpdate
                ? 'text-emerald-900 bg-amber-400 hover:bg-amber-300'
                : 'text-sky-100 border border-sky-400/50 hover:bg-sky-400/15'
            }`}
            title="Ricalcola i path dell'albero dal dizionario corrente (ordine categorie incluso)"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {hasTaxonomy ? 'Ricrea ontologia' : 'Crea ontologia'}
          </button>
        )}
        <button
          type="button"
          onClick={() => void dictState?.save()}
          disabled={!dictState?.canSave}
          className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-sm font-semibold text-emerald-900 bg-sky-400 rounded hover:bg-sky-300 transition-colors disabled:opacity-40"
        >
          <Save className="w-3.5 h-3.5" />
          Salva dizionario
        </button>
        {dictState?.dirty && (
          <button
            type="button"
            onClick={() => dictState.discard()}
            className="flex items-center gap-1 px-2 py-1.5 font-mono text-sm text-emerald-400/60 border border-[#1a3a2a] rounded hover:border-emerald-400/30 hover:text-emerald-400/90 transition-colors"
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
    const meta = activeId ? dicts.getDictionaryMeta(activeId) : null;
    const canSave = !!session?.dirty && !!activeId && dicts.savingDictionaryId !== activeId;
    const sessionCategories = session?.categories ?? meta?.categories ?? [];
    const sessionTokens = session?.tokens ?? meta?.tokens ?? [];
    const missingGrammarCount = findCategoriesMissingGrammar(sessionCategories).length;
    const grammarTargetCount = sessionCategories.filter(
      (cat) => cat.type !== 'vincolo' && (cat.tokenTexts?.length ?? 0) > 0,
    ).length;
    const hasAnyCategoryGrammar = grammarTargetCount > 0 && missingGrammarCount < grammarTargetCount;
    const hasGrammarTargets = grammarTargetCount > 0;
    const regenerateAllLabel = hasAnyCategoryGrammar
      ? 'Rigenera tutte le grammatiche'
      : 'Genera tutte le grammatiche';
    const grammarBusy = generating && generatingPhase === 'grammars';

    const runDictionaryGrammars = (overwrite: boolean) => {
      if (!activeId || !meta) return;
      void generateDictionaryCategoryGrammars(sessionTokens, sessionCategories, overwrite)
        .then((nextCategories) => {
          dicts.setSessionCategories(activeId, nextCategories);
        })
        .catch(() => {});
    };

    return (
      <div className="flex flex-wrap items-center gap-2 flex-shrink-0 justify-end">
        {canRefreshOntology && agentNeedsUpdate && (
          <button
            type="button"
            onClick={refreshOntology}
            className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-sm font-semibold text-emerald-900 bg-amber-400 rounded hover:bg-amber-300 transition-colors"
            title="L'ordine categorie è cambiato — ricrea l'albero ontologia"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Ricrea ontologia
          </button>
        )}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => runDictionaryGrammars(false)}
            disabled={!activeId || !hasGrammarTargets || grammarBusy || missingGrammarCount === 0}
            title={`Compila le grammatiche di riconoscimento per le ${missingGrammarCount} categorie senza grammatica`}
            className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-sm font-semibold text-emerald-900 bg-sky-400 rounded hover:bg-sky-300 transition-colors disabled:opacity-40"
          >
            {grammarBusy
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Braces className="w-3.5 h-3.5" />}
            {missingGrammarCount > 0
              ? `Genera grammatiche mancanti (${missingGrammarCount})`
              : 'Genera grammatiche mancanti'}
          </button>
          <button
            type="button"
            onClick={() => runDictionaryGrammars(true)}
            disabled={!activeId || !hasGrammarTargets || grammarBusy}
            title={hasAnyCategoryGrammar
              ? 'Rigenera tutte le grammatiche di categoria (sovrascrive quelle esistenti)'
              : 'Genera le grammatiche di riconoscimento per tutte le categorie'}
            className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-sm font-semibold rounded border border-sky-400/50 text-sky-100 hover:bg-sky-400/15 transition-colors disabled:opacity-40"
          >
            {grammarBusy
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <RotateCcw className="w-3.5 h-3.5" />}
            {regenerateAllLabel}
          </button>
          {grammarBusy && (
            <button
              type="button"
              onClick={cancelGeneration}
              className="flex items-center justify-center w-7 h-7 rounded border border-red-400/40 bg-red-400/10 text-red-400/80 hover:bg-red-400/20 hover:text-red-300 transition-colors"
              title="Annulla generazione"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            if (!activeId) return;
            void dicts.saveDictionary(activeId);
          }}
          disabled={!canSave}
          className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-sm font-semibold text-emerald-900 bg-sky-400 rounded hover:bg-sky-300 transition-colors disabled:opacity-40"
        >
          <Save className="w-3.5 h-3.5" />
          Salva dizionario
        </button>
        {session?.dirty && activeId && (
          <button
            type="button"
            onClick={() => dicts.discardDictionary(activeId)}
            className="flex items-center gap-1 px-2 py-1.5 font-mono text-sm text-emerald-400/60 border border-[#1a3a2a] rounded hover:border-emerald-400/30 hover:text-emerald-400/90 transition-colors"
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
    const resolveCorpusContext = () => {
      const descriptions = dictState?.getDescriptions()
        ?? agentDictionaryContext?.descriptions
        ?? [];
      const activeTokenCount = agentDictionaryContext?.activeTokenCount
        ?? dictState?.activeTokenCount
        ?? 0;
      return { descriptions, activeTokenCount };
    };
    const canGenerateMessages = dictionaryMode
      ? (resolveCorpusContext().activeTokenCount > 0 && hasTaxonomy && !generating)
      : !!documentText && !generating;
    const runGenerateMessages = () => {
      const contextText = documentText ?? '';
      if (dictionaryMode) {
        const { descriptions, activeTokenCount } = resolveCorpusContext();
        const loadedRefs = buildLiveLoadedRefs();
        if (activeTokenCount === 0 || loadedRefs.length === 0) return;
        void generateMessagesFromDictionary(descriptions, loadedRefs, doc.name, contextText).catch(() => {});
      } else if (documentText) {
        void generateMessagesFromText(documentText, doc.name).catch(() => {});
      }
    };

    return (
      <div className="flex flex-wrap items-center gap-2 flex-shrink-0 justify-end">
        {canRefreshOntology && (
          <button
            type="button"
            onClick={refreshOntology}
            className={`flex items-center gap-1.5 px-3 py-1.5 font-mono text-sm font-semibold rounded transition-colors ${
              agentNeedsUpdate
                ? 'text-emerald-900 bg-amber-400 hover:bg-amber-300'
                : 'text-sky-100 border border-sky-400/50 hover:bg-sky-400/15'
            }`}
            title="Ricalcola i path dell'albero dal dizionario corrente"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {hasTaxonomy ? 'Ricrea ontologia' : 'Crea ontologia'}
          </button>
        )}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={runGenerateMessages}
            disabled={!canGenerateMessages}
            className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-sm font-semibold text-emerald-900 bg-emerald-400 rounded hover:bg-emerald-300 transition-colors disabled:opacity-40"
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
              className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-sm font-semibold text-emerald-900 bg-sky-400 rounded hover:bg-sky-300 transition-colors disabled:opacity-40"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? 'Salvataggio…' : 'Salva analisi'}
            </button>
            {analysisDirty && (
              <button
                type="button"
                onClick={() => void discardAnalysisChanges()}
                disabled={saving || generating}
                className="flex items-center gap-1 px-2 py-1.5 font-mono text-sm text-emerald-400/60 border border-[#1a3a2a] rounded hover:border-emerald-400/30 hover:text-emerald-400/90 transition-colors disabled:opacity-30"
              >
                <RotateCcw className="w-3 h-3" />
                Annulla
              </button>
            )}
            <button
              type="button"
              onClick={() => setAffinaOpen((v) => !v)}
              disabled={generating}
              className="flex items-center gap-1 px-2 py-1.5 font-mono text-sm text-amber-400/60 border border-amber-400/25 rounded hover:border-amber-400/50 hover:text-amber-400/90 transition-colors disabled:opacity-30"
            >
              <Wand2 className="w-3 h-3" />
              Affina
            </button>
            <button
              type="button"
              onClick={() => setConvaiOpen(true)}
              disabled={!hasTaxonomy || !agentDictionaryContext}
              title="Export per ElevenLabs Convai"
              className={`flex items-center gap-1 px-2 py-1.5 font-mono text-sm border rounded transition-colors disabled:opacity-40 ${
                convaiOpen
                  ? 'text-violet-200 border-violet-400/50 bg-violet-400/10'
                  : 'text-violet-300/70 border-violet-400/25 hover:border-violet-400/50 hover:text-violet-200'
              }`}
            >
              <Mic className="w-3 h-3" />
              Convai
            </button>
            <button
              type="button"
              onClick={() => setConvaiNoBeOpen(true)}
              disabled={!hasTaxonomy || !agentDictionaryContext}
              title="Deploy Convai senza backend: prompt algoritmo + KB strutturata"
              className={`flex items-center gap-1 px-2 py-1.5 font-mono text-sm border rounded transition-colors disabled:opacity-40 ${
                convaiNoBeOpen
                  ? 'text-amber-200 border-amber-400/50 bg-amber-400/10'
                  : 'text-amber-300/70 border-amber-400/25 hover:border-amber-400/50 hover:text-amber-200'
              }`}
            >
              Convalida no be
            </button>
            {hasMessages && (
              <button
                type="button"
                onClick={() => setTestOpen((v) => !v)}
                className={`flex items-center gap-1 px-2 py-1.5 font-mono text-sm border rounded transition-colors ${
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
        className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-sm font-semibold text-emerald-900 bg-amber-400 rounded hover:bg-amber-300 transition-colors disabled:opacity-40"
      >
        <BookOpen className="w-3 h-3" />
        Ontologia
      </button>
    );
  }

  return null;
}
