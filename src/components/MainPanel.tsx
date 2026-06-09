import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildLeafDescriptionMap,
  loadSavedTokens,
  segmentAllDescriptions,
} from '../lib/tokenDictionary';
import {
  FileText, FileSpreadsheet, File, Image, FileCode, FileJson, BookOpen, Sparkles, Loader2,
  Bot, Save, RotateCcw, Wand2, FlaskConical, X, MessageSquare, Braces, Filter,
} from 'lucide-react';
import type { KbDocument, KbFileFormat } from '../lib/supabase';
import { formatLabel, formatColor, supportsDictionaryFormat } from '../lib/fileFormat';
import { DocumentReader } from './DocumentViewer/DocumentReader';
import { AnalysisView } from './DocumentViewer/AnalysisView';
import { DictionaryPanel, type DictionaryPanelState } from './DocumentViewer/DictionaryPanel';
import { useAnalysis } from '../hooks/useAnalysis';
import { useDocumentContent } from '../hooks/useDocumentContent';

function FormatIcon({ format, className = '' }: { format: KbFileFormat; className?: string }) {
  const props = { className: `w-4 h-4 flex-shrink-0 ${className}` };
  switch (format) {
    case 'pdf': return <File {...props} />;
    case 'docx': return <FileText {...props} />;
    case 'xlsx': case 'csv': return <FileSpreadsheet {...props} />;
    case 'json': return <FileJson {...props} />;
    case 'md': return <BookOpen {...props} />;
    case 'image': return <Image {...props} />;
    default: return <FileCode {...props} />;
  }
}

type TabId = 'document' | 'tokenization' | 'agent';

interface MainPanelProps {
  doc: KbDocument;
  fileUrl: string;
  onDocUpdated: (doc: KbDocument) => void;
}

export function MainPanel({ doc, fileUrl, onDocUpdated }: MainPanelProps) {
  const [tab, setTab] = useState<TabId>('document');
  const [dictState, setDictState] = useState<DictionaryPanelState | null>(null);
  const [affinaOpen, setAffinaOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [grammarModalOpen, setGrammarModalOpen] = useState(false);
  const [grammarOverwrite, setGrammarOverwrite] = useState(false);
  const [showOnlyMessageNodes, setShowOnlyMessageNodes] = useState(false);

  const dictionaryMode = supportsDictionaryFormat(doc.format);
  const content = useDocumentContent(doc, fileUrl);
  const documentText = content.text;
  const analysisApi = useAnalysis(doc.id);
  const {
    generating, generatingPhase, agentGenProgress, error, analysis, load,
    generateMessagesFromDictionary, generateMessagesFromText, generateGrammars, generateGrammarsWithAi,
    saveAnalysis, discardAnalysisChanges, cancelGeneration,
    saving, analysisDirty, messagesReady, hasMessages, agentReady, hasTaxonomy, canGenerateGrammars,
    missingGrammarCount, grammarsReady,
  } = analysisApi;
  const didAutoTokenTab = useRef(false);

  useEffect(() => {
    setTab('document');
    didAutoTokenTab.current = false;
    setDictState(null);
    setAffinaOpen(false);
    setTestOpen(false);
    setSelectedSlot(null);
    setGrammarModalOpen(false);
  }, [doc.id]);

  useEffect(() => {
    void load();
  }, [doc.id, load]);

  useEffect(() => {
    if (content.tabular && dictionaryMode && !didAutoTokenTab.current) {
      didAutoTokenTab.current = true;
      setTab('tokenization');
    }
  }, [content.tabular, dictionaryMode]);

  const handleDictStateChange = useCallback((state: DictionaryPanelState) => {
    setDictState(state);
  }, []);

  const handleGenerateMessages = async () => {
    setTab('agent');
    const contextText = documentText ?? '';
    if (dictionaryMode) {
      const dict = dictState?.getDictionary();
      const descriptions = dictState?.getDescriptions() ?? [];
      if (!dict || dictState!.activeTokenCount === 0) return;
      try {
        await generateMessagesFromDictionary(dict, descriptions, doc.name, contextText);
      } catch {
        return;
      }
    } else if (documentText) {
      try {
        await generateMessagesFromText(documentText, doc.name);
      } catch {
        return;
      }
    }
  };

  const handleGenerateGrammars = async () => {
    setTab('agent');
    if (!hasTaxonomy) return;
    const overwrite = grammarOverwrite;
    try {
      await generateGrammars(documentText ?? '', doc.name, overwrite);
      if (overwrite) setGrammarOverwrite(false);
    } catch {
      return;
    }
  };

  /** Con ↻ attivo: sempre abilitato (sovrascrive tutto). Altrimenti solo se mancano/invalide. */
  const canRunGrammarGeneration = hasTaxonomy && !generating
    && (grammarOverwrite || missingGrammarCount > 0);

  const canGenerateMessages = dictionaryMode
    ? (dictState?.activeTokenCount ?? 0) > 0 && !generating
    : !!documentText && !generating;

  const selectedRow = analysis?.rows.find((r) => r.slot_filling === selectedSlot) ?? null;
  const canShowGrammar = !!selectedRow?.grammar?.regex;

  const leafDescriptionMap = useMemo(() => {
    if (!content.tabular) return null;
    const dict = dictState?.getDictionary();
    const descriptions = dictState?.getDescriptions() ?? [];
    if (dict && descriptions.length > 0) {
      const { rows } = segmentAllDescriptions(descriptions, dict.tokens, dict.categories ?? []);
      return buildLeafDescriptionMap(rows);
    }
    const saved = doc.token_dictionary;
    const descCol = saved?.descriptionColumn
      ?? Object.entries(doc.column_roles).find(([, r]) => r === 'description')?.[0];
    if (!saved || !descCol) return null;
    const idx = content.tabular.headers.indexOf(descCol);
    if (idx < 0) return null;
    const corpus = content.tabular.rows
      .map((row) => String(row[idx] ?? '').trim())
      .filter(Boolean);
    const tokens = loadSavedTokens(saved, descCol);
    if (tokens.length === 0 || corpus.length === 0) return null;
    const { rows } = segmentAllDescriptions(corpus, tokens, saved?.categories ?? []);
    return buildLeafDescriptionMap(rows);
  }, [content.tabular, dictState, doc.token_dictionary, doc.column_roles]);

  const visibleTabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'document', label: 'Documento originale', icon: <FileText className="w-3.5 h-3.5" /> },
    ...(dictionaryMode
      ? [{ id: 'tokenization' as TabId, label: 'Ontologia', icon: <BookOpen className="w-3.5 h-3.5" /> }]
      : []),
    { id: 'agent', label: 'Agente Virtuale', icon: <Sparkles className="w-3.5 h-3.5" /> },
  ];

  const tabLabel: Record<TabId, string> = {
    document: 'DOCUMENTO ORIGINALE',
    tokenization: 'ONTOLOGIA · 3 COLONNE',
    agent: 'AGENTE VIRTUALE',
  };

  const renderToolbar = () => {
    if (tab === 'tokenization' && dictionaryMode) {
      return (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void dictState?.save()}
            disabled={!dictState?.canSave}
            className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-xs font-semibold text-emerald-900 bg-sky-400 rounded hover:bg-sky-300 transition-colors disabled:opacity-40"
          >
            <Save className="w-3.5 h-3.5" />
            Salva token
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

    if (tab === 'agent') {
      const hasData = (analysis?.rows.length ?? 0) > 0;
      return (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void handleGenerateMessages()}
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
              title={showOnlyMessageNodes
                ? 'Mostra tutti i nodi'
                : 'Mostra solo nodi con messaggio (domanda)'}
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
              onClick={() => void handleGenerateGrammars()}
              disabled={!canRunGrammarGeneration}
              title={grammarOverwrite
                ? 'Sovrascrive tutte le grammatiche con template dai path (istantaneo)'
                : missingGrammarCount > 0
                  ? `Genera grammatiche mancanti (${missingGrammarCount}) — istantaneo`
                  : 'Tutte le grammatiche sono valide (attiva ↻ per sovrascrivere tutte)'}
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
              title="Affina grammatiche con IA (lento, opzionale)"
              className="flex items-center gap-1 px-2 py-1.5 font-mono text-[10px] rounded border border-violet-400/30 text-violet-300/80 hover:bg-violet-400/10 transition-colors disabled:opacity-40"
            >
              {generating && generatingPhase === 'grammars' ? 'IA…' : 'IA'}
            </button>
            <button
              type="button"
              onClick={() => setGrammarOverwrite((v) => !v)}
              disabled={!hasTaxonomy || generating}
              aria-pressed={grammarOverwrite}
              title={grammarOverwrite
                ? 'Sovrascrivi tutte (attivo) — clicca per tornare a solo mancanti'
                : 'Solo grammatiche mancanti/invalide — clicca per sovrascrivere tutte'}
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
                title="Interrompi generazione"
                className="flex items-center justify-center w-7 h-7 rounded border border-red-400/40 bg-red-400/10 text-red-400/80 hover:bg-red-400/20 hover:text-red-300 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {hasData && (
            <button
              type="button"
              onClick={() => setGrammarModalOpen(true)}
              disabled={!canShowGrammar}
              title={selectedSlot
                ? canShowGrammar
                  ? `Grammatica di ${selectedSlot.split('.').pop()}`
                  : 'Il nodo selezionato non ha grammatica'
                : 'Seleziona un nodo nell\'albero'}
              className="flex items-center justify-center w-8 h-8 rounded border border-sky-400/30 bg-sky-400/10 text-sky-300/80 hover:bg-sky-400/20 hover:text-sky-200 transition-colors disabled:opacity-30"
            >
              <Braces className="w-4 h-4" />
            </button>
          )}
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
                  title={agentReady
                    ? 'Apri chat di test'
                    : 'Apri chat (genera le grammatiche per il riconoscimento risposte)'}
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

    if (dictionaryMode) {
      return (
        <button
          type="button"
          onClick={() => setTab('tokenization')}
          disabled={content.loading || !content.tabular}
          className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-xs font-semibold text-emerald-900 bg-amber-400 rounded hover:bg-amber-300 transition-colors disabled:opacity-40"
        >
          <BookOpen className="w-3 h-3" />
          Ontologia
        </button>
      );
    }

    return null;
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      <div className="flex-shrink-0 px-4 py-3 border-b border-[#1a3a2a] bg-[#080e0a]">
        <div className="flex items-center gap-2 mb-2">
          <span className={formatColor(doc.format).split(' ')[0]}>
            <FormatIcon format={doc.format} />
          </span>
          <h2 className="font-mono text-sm text-emerald-200 truncate flex-1 min-w-0">{doc.name}</h2>
          {content.tabular && (
            <span className="flex-shrink-0 font-mono text-[10px] text-emerald-400/50 tabular-nums">
              {content.tabular.rows.length} righe
            </span>
          )}
          <span className={`flex-shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded border ${formatColor(doc.format)}`}>
            {formatLabel(doc.format)}
          </span>
        </div>
        {doc.column_headers && doc.column_headers.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            {doc.column_headers.map((col) => (
              <span
                key={col}
                className="flex-shrink-0 font-mono text-[10px] px-2 py-0.5 rounded-full bg-[#0a2a18] border border-emerald-400/20 text-emerald-400/70"
              >
                {col}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex-shrink-0 flex items-center justify-between px-4 border-b border-[#1a3a2a] bg-[#080e0a]">
        <div className="flex items-center gap-0">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`
                flex items-center gap-1.5 px-3 py-2 font-mono text-xs border-b-2 transition-colors
                ${tab === t.id
                  ? 'border-emerald-400 text-emerald-300'
                  : 'border-transparent text-emerald-400/40 hover:text-emerald-400/70'
                }
              `}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
        {renderToolbar()}
      </div>

      <div className="flex-shrink-0 px-4 py-1 bg-[#0a0a0a] border-b border-[#111]">
        <span className="font-mono text-[10px] text-emerald-400/30 uppercase tracking-widest">
          {tabLabel[tab]}
        </span>
      </div>

      {tab === 'agent' && generating && (generatingPhase === 'messages' || generatingPhase === 'grammars') && agentGenProgress && (
        <div className="flex-shrink-0 px-4 py-2 border-b border-[#1a3a2a] bg-[#0a1510]">
          <div className="flex items-center justify-between gap-2 mb-1.5 font-mono text-[10px] text-emerald-400/70">
            <span>
              {generatingPhase === 'grammars'
                ? agentGenProgress.rootSlot === 'completato'
                  ? 'Grammatiche generate'
                  : agentGenProgress.rootSlot === 'preparazione'
                    ? 'Generazione grammatiche (istantaneo)…'
                    : `Generazione grammatiche — ${agentGenProgress.rootSlot.split('.').pop()}`
                : 'Generazione messaggi'}{' '}
              {generatingPhase === 'messages' && (
                <span className="text-emerald-300">{agentGenProgress.rootSlot.split('.').pop()}</span>
              )}
            </span>
            <span className="tabular-nums">
              {generatingPhase === 'grammars' && agentGenProgress.rootSlot === 'preparazione'
                ? '…'
                : `${agentGenProgress.current}/${agentGenProgress.total}`}
              {generatingPhase === 'messages' ? ' rami' : ' nodi'}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-[#1a3a2a] overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                generatingPhase === 'grammars' ? 'bg-sky-400' : 'bg-emerald-400'
              }`}
              style={{
                width: `${Math.max(
                  8,
                  (agentGenProgress.current / Math.max(agentGenProgress.total, 1)) * 100,
                )}%`,
              }}
            />
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-hidden bg-[#0d0d0d] relative">
        <div className={tab === 'document' ? 'absolute inset-0 flex flex-col' : 'hidden'}>
          <DocumentReader doc={doc} fileUrl={fileUrl} content={content} />
        </div>
        {dictionaryMode && (
          <div className={tab === 'tokenization' ? 'absolute inset-0 flex flex-col' : 'hidden'}>
            {content.loading ? (
              <div className="flex items-center justify-center h-full gap-2 text-emerald-400/30 font-mono text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Caricamento tabella…
              </div>
            ) : content.tabular ? (
              <DictionaryPanel
                doc={doc}
                tabular={content.tabular}
                onDocUpdated={onDocUpdated}
                onStateChange={handleDictStateChange}
                error={error}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-emerald-400/30 font-mono text-sm px-8 text-center">
                Impossibile leggere la tabella da questo file.
              </div>
            )}
          </div>
        )}
        <div className={tab === 'agent' ? 'absolute inset-0 flex flex-col' : 'hidden'}>
          <AnalysisView
            doc={doc}
            documentText={documentText}
            analysisApi={analysisApi}
            externalToolbar
            affinaOpen={affinaOpen}
            onAffinaOpenChange={setAffinaOpen}
            testOpen={testOpen}
            onTestOpenChange={setTestOpen}
            leafDescriptionMap={leafDescriptionMap}
            selectedSlot={selectedSlot}
            onSelectedSlotChange={setSelectedSlot}
            grammarModalOpen={grammarModalOpen}
            onGrammarModalOpenChange={setGrammarModalOpen}
            showOnlyMessageNodes={showOnlyMessageNodes}
            grammarOverwrite={grammarOverwrite}
            onGrammarOverwriteChange={setGrammarOverwrite}
          />
        </div>
      </div>
    </div>
  );
}
