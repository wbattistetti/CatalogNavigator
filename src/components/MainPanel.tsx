import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildLeafDescriptionMap,
  loadSavedTokens,
  segmentAllDescriptions,
} from '../lib/tokenDictionary';
import {
  FileText, FileSpreadsheet, File, Image, FileCode, FileJson, BookOpen, Sparkles, Loader2,
  Bot, Save, RotateCcw, Wand2, FlaskConical, X,
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

  const dictionaryMode = supportsDictionaryFormat(doc.format);
  const content = useDocumentContent(doc, fileUrl);
  const documentText = content.text;
  const analysisApi = useAnalysis(doc.id);
  const {
    generating, generatingPhase, agentGenProgress, error, analysis, load,
    generateFullAgentFromDictionary, generateFullAgentFromText, saveAnalysis, discardAnalysisChanges,
    cancelGeneration,
    saving, analysisDirty, agentReady,
  } = analysisApi;
  const didAutoTokenTab = useRef(false);

  useEffect(() => {
    setTab('document');
    didAutoTokenTab.current = false;
    setDictState(null);
    setAffinaOpen(false);
    setTestOpen(false);
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

  const handleGenerateFullAgent = async () => {
    setTab('agent');
    const contextText = documentText ?? '';
    if (dictionaryMode) {
      const dict = dictState?.getDictionary();
      const descriptions = dictState?.getDescriptions() ?? [];
      if (!dict || dictState!.activeTokenCount === 0) return;
      try {
        await generateFullAgentFromDictionary(dict, descriptions, doc.name, contextText);
      } catch {
        return;
      }
    } else if (documentText) {
      try {
        await generateFullAgentFromText(documentText, doc.name);
      } catch {
        return;
      }
    }
  };

  const canGenerateAgent = dictionaryMode
    ? (dictState?.activeTokenCount ?? 0) > 0 && !generating
    : !!documentText && !generating;

  const leafDescriptionMap = useMemo(() => {
    if (!content.tabular) return null;
    const dict = dictState?.getDictionary();
    const descriptions = dictState?.getDescriptions() ?? [];
    if (dict && descriptions.length > 0) {
      const { rows } = segmentAllDescriptions(descriptions, dict.tokens);
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
    const { rows } = segmentAllDescriptions(corpus, tokens);
    return buildLeafDescriptionMap(rows);
  }, [content.tabular, dictState, doc.token_dictionary, doc.column_roles]);

  const visibleTabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'document', label: 'Documento originale', icon: <FileText className="w-3.5 h-3.5" /> },
    ...(dictionaryMode
      ? [{ id: 'tokenization' as TabId, label: 'Tokenizzazione', icon: <BookOpen className="w-3.5 h-3.5" /> }]
      : []),
    { id: 'agent', label: 'Messaggi agente', icon: <Sparkles className="w-3.5 h-3.5" /> },
  ];

  const tabLabel: Record<TabId, string> = {
    document: 'DOCUMENTO ORIGINALE',
    tokenization: 'TOKENIZZAZIONE · 3 COLONNE',
    agent: 'MESSAGGI AGENTE',
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
              onClick={() => void handleGenerateFullAgent()}
              disabled={!canGenerateAgent}
              className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-xs font-semibold text-emerald-900 bg-emerald-400 rounded hover:bg-emerald-300 transition-colors disabled:opacity-40"
            >
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
              {generating
                ? generatingPhase === 'taxonomy'
                  ? 'Costruisco albero…'
                  : 'Genero messaggi…'
                : 'Genera agente'}
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
              {agentReady && (
                <button
                  type="button"
                  onClick={() => setTestOpen((v) => !v)}
                  className={`flex items-center gap-1 px-2 py-1.5 font-mono text-[10px] border rounded transition-colors ${
                    testOpen
                      ? 'text-emerald-300 border-emerald-400/50 bg-emerald-400/10'
                      : 'text-emerald-400/60 border-emerald-400/25 hover:border-emerald-400/50 hover:text-emerald-400/90'
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
          Tokenizzazione
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

      {tab === 'agent' && generating && generatingPhase === 'agent' && agentGenProgress && (
        <div className="flex-shrink-0 px-4 py-2 border-b border-[#1a3a2a] bg-[#0a1510]">
          <div className="flex items-center justify-between gap-2 mb-1.5 font-mono text-[10px] text-emerald-400/70">
            <span>
              Generazione messaggi —{' '}
              <span className="text-emerald-300">{agentGenProgress.rootSlot.split('.').pop()}</span>
            </span>
            <span className="tabular-nums">
              {agentGenProgress.current}/{agentGenProgress.total} rami
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-[#1a3a2a] overflow-hidden">
            <div
              className="h-full bg-emerald-400 transition-all duration-300"
              style={{ width: `${(agentGenProgress.current / agentGenProgress.total) * 100}%` }}
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
          />
        </div>
      </div>
    </div>
  );
}
