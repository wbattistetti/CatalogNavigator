/**
 * Contextual toolbar rendered in the global App header while a project document is open.
 */
import {
  Braces, FileSpreadsheet, FlaskConical, Loader2, Mic,
  RefreshCw, RotateCcw, Save, X,
} from 'lucide-react';
import { useDocumentEditorController, useDocumentEditorTab } from './DocumentEditorContext';
import { EDITOR_TAB_IDS } from './editorTabIds';
import { findCategoriesMissingGrammar } from '../../lib/categoryGrammar';
import { exportOntologyToExcel } from '../../lib/exportOntologyExcel';

const outlineBtn = 'flex items-center gap-1 px-2 py-1 font-mono text-xs border rounded transition-colors disabled:opacity-40';
const outlineActive = 'text-emerald-200 border-emerald-400/45 bg-emerald-400/10';
const outlineIdle = 'text-emerald-300/75 border-[#1a3a2a] hover:border-emerald-400/35 hover:text-emerald-200';
const headerChip = 'inline-flex items-center gap-1 px-2 py-0.5 font-mono text-xs border rounded transition-colors disabled:opacity-40 flex-shrink-0';

/** Left header chip: saves dictionary + ontology when dirty. */
export function ProjectLeftActions() {
  const {
    dictionaryMode,
    canSaveProject,
    savingProject,
    saveProject,
    dictState,
    analysisApi,
  } = useDocumentEditorController();

  if (!dictionaryMode) return null;

  const { analysisDirty, hasTaxonomy } = analysisApi;
  const saveTooltip = [
    dictState?.canSave ? 'dizionario' : null,
    analysisDirty && hasTaxonomy ? 'ontologia, messaggi e grammatiche agente' : null,
  ].filter(Boolean).join(' + ') || 'Nessuna modifica da salvare';

  return (
    <button
      type="button"
      onClick={() => void saveProject()}
      disabled={!canSaveProject || savingProject}
      title={saveTooltip}
      className={`${headerChip} text-[#e8d48b]/80 border-[#e8d48b]/30 hover:border-[#e8d48b]/50 hover:text-[#e8d48b] hover:bg-[#e8d48b]/8 disabled:hover:bg-transparent disabled:hover:border-[#e8d48b]/30`}
    >
      {savingProject
        ? <Loader2 className="w-3 h-3 animate-spin" />
        : <Save className="w-3 h-3" />}
      {savingProject ? 'Salvataggio…' : 'Salva progetto'}
    </button>
  );
}

function ProjectActionsToolbar() {
  const {
    doc,
    dictionaryMode,
    analysisApi,
    dictState,
    convaiOpen,
    setConvaiOpen,
    testOpen,
    setTestOpen,
    agentDictionaryContext,
    agentNeedsUpdate,
    canRefreshOntology,
    showOntologyRefreshButton,
    ontologyRefreshDisabledReason,
    refreshingOntology,
    ontologyRefreshProgress,
    cancelOntologyRefresh,
    refreshOntology,
    buildLiveLoadedRefs,
    leafDescriptionMap,
  } = useDocumentEditorController();

  const {
    generating, generatingPhase, analysis,
    cancelGeneration,
    analysisDirty, hasTaxonomy, agentReady,
  } = analysisApi;

  const canTest = dictionaryMode && hasTaxonomy;

  const ontologyRefreshButton = (label: string, highlight = false) => {
    const progressLabel = refreshingOntology && ontologyRefreshProgress
      ? ontologyRefreshProgress.phase === 'building'
        ? 'Costruzione albero…'
        : `${ontologyRefreshProgress.current.toLocaleString('it-IT')} / ${ontologyRefreshProgress.total.toLocaleString('it-IT')}`
      : 'Ricreazione ontologia…';

    if (!showOntologyRefreshButton && !refreshingOntology) return null;

    const disabled = refreshingOntology || !canRefreshOntology;
    const title = ontologyRefreshDisabledReason
      ?? 'Ricalcola i path dell\'albero dal dizionario corrente (ordine categorie incluso)';

    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={refreshOntology}
          disabled={disabled}
          className={`${outlineBtn} ${
            highlight
              ? 'text-amber-200 border-amber-400/50 bg-amber-400/10 hover:bg-amber-400/15'
              : outlineIdle
          }`}
          title={title}
        >
          {refreshingOntology
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <RefreshCw className="w-3 h-3" />}
          {refreshingOntology ? progressLabel : label}
        </button>
        {refreshingOntology && (
          <button
            type="button"
            onClick={cancelOntologyRefresh}
            className={`${outlineBtn} text-red-300/90 border-red-400/40 hover:bg-red-400/10`}
            title="Interrompi la ricreazione ontologia"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  };

  const runExportOntology = () => {
    if (!analysis || !agentDictionaryContext) return;
    const descriptions = dictState?.getDescriptions()
      ?? agentDictionaryContext.descriptions;
    try {
      exportOntologyToExcel({
        documentName: doc.name,
        dictionary: agentDictionaryContext.dictionary,
        descriptions,
        analysis,
        loadedRefs: buildLiveLoadedRefs(),
        leafDescriptionMap: leafDescriptionMap ?? undefined,
        dictionaryDirty: dictState?.dirty,
        analysisDirty,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export ontologia fallito.';
      window.alert(message);
    }
  };

  return (
    <>
      {ontologyRefreshButton(hasTaxonomy ? 'Ricrea ontologia' : 'Crea ontologia', agentNeedsUpdate)}
      {generating && generatingPhase === 'disambiguation' && (
        <button
          type="button"
          onClick={cancelGeneration}
          className={`${outlineBtn} text-red-300/90 border-red-400/40 hover:bg-red-400/10`}
          title="Annulla generazione messaggi"
        >
          <X className="w-3 h-3" />
          Annulla generazione
        </button>
      )}
      <button
        type="button"
        onClick={runExportOntology}
        disabled={!hasTaxonomy || !agentDictionaryContext}
        title="Scarica catalogo ontologia in Excel (descrizione + categorie usate)"
        className={`${outlineBtn} ${outlineIdle}`}
      >
        <FileSpreadsheet className="w-3 h-3" />
        Esporta ontologia
      </button>
      <button
        type="button"
        onClick={() => setConvaiOpen(true)}
        disabled={!hasTaxonomy || !agentDictionaryContext}
        title="Export per ElevenLabs Convai"
        className={`${outlineBtn} ${convaiOpen ? outlineActive : outlineIdle}`}
      >
        <Mic className="w-3 h-3" />
        Deploy Convai
      </button>
      {canTest && (
        <button
          type="button"
          onClick={() => setTestOpen((open) => !open)}
          title={agentReady
            ? 'Apri test motore VB'
            : 'Apri test (genera le grammatiche per il riconoscimento risposte)'}
          className={`${outlineBtn} ${testOpen ? outlineActive : outlineIdle}`}
        >
          <FlaskConical className="w-3 h-3" />
          Test
        </button>
      )}
    </>
  );
}

export function DocumentEditorToolbar() {
  const {
    dictionaryMode,
    showOntologyTab,
    dictState,
    dicts,
    analysisApi,
  } = useDocumentEditorController();
  const { activeTab } = useDocumentEditorTab();

  const {
    generating, generatingPhase,
    generateDictionaryCategoryGrammars,
    cancelGeneration,
  } = analysisApi;

  if (activeTab === EDITOR_TAB_IDS.ontology && showOntologyTab) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 flex-shrink-0">
        <ProjectActionsToolbar />
        {dictState?.dirty && (
          <button
            type="button"
            onClick={() => dictState.discard()}
            className={`${outlineBtn} ${outlineIdle}`}
          >
            <RotateCcw className="w-3 h-3" />
            Annulla
          </button>
        )}
      </div>
    );
  }

  if (activeTab === EDITOR_TAB_IDS.disambiguation && showOntologyTab) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 flex-shrink-0">
        <ProjectActionsToolbar />
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
      <div className="flex flex-wrap items-center gap-1.5 flex-shrink-0">
        <ProjectActionsToolbar />
        <button
          type="button"
          onClick={() => runDictionaryGrammars(false)}
          disabled={!activeId || !hasGrammarTargets || grammarBusy || missingGrammarCount === 0}
          title={`Compila le grammatiche di riconoscimento per le ${missingGrammarCount} categorie senza grammatica`}
          className={`${outlineBtn} ${outlineIdle}`}
        >
          {grammarBusy
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <Braces className="w-3 h-3" />}
          {missingGrammarCount > 0
            ? `Grammatiche (${missingGrammarCount})`
            : 'Grammatiche'}
        </button>
        <button
          type="button"
          onClick={() => runDictionaryGrammars(true)}
          disabled={!activeId || !hasGrammarTargets || grammarBusy}
          title={hasAnyCategoryGrammar
            ? 'Rigenera tutte le grammatiche di categoria (sovrascrive quelle esistenti)'
            : 'Genera le grammatiche di riconoscimento per tutte le categorie'}
          className={`${outlineBtn} ${outlineIdle}`}
        >
          {grammarBusy
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <RotateCcw className="w-3 h-3" />}
          {regenerateAllLabel}
        </button>
        {grammarBusy && (
          <button
            type="button"
            onClick={cancelGeneration}
            className={`${outlineBtn} text-red-300/90 border-red-400/40 hover:bg-red-400/10`}
            title="Annulla generazione"
          >
            <X className="w-3 h-3" />
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            if (!activeId) return;
            void dicts.saveDictionary(activeId);
          }}
          disabled={!canSave}
          title="Salva il dizionario in modifica (tab Dizionari)"
          className={`${outlineBtn} ${outlineIdle}`}
        >
          {dicts.savingDictionaryId === activeId
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <Save className="w-3 h-3" />}
          Salva dizionario
        </button>
        {session?.dirty && activeId && (
          <button
            type="button"
            onClick={() => dicts.discardDictionary(activeId)}
            className={`${outlineBtn} ${outlineIdle}`}
          >
            <RotateCcw className="w-3 h-3" />
            Annulla
          </button>
        )}
      </div>
    );
  }

  if (dictionaryMode && activeTab === EDITOR_TAB_IDS.document) {
    return <ProjectActionsToolbar />;
  }

  return null;
}
