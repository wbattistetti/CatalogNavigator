/**
 * Modal panel for ElevenLabs Convai export: system prompt, ontology, dictionary, unified KB.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Mic, X } from 'lucide-react';
import { buildConvaiFullExport } from '../../lib/convaiExport';
import type { Analysis } from '../../lib/analysisTypes';
import type { TokenDictionary } from '../../lib/tokenDictionary';

type ConvaiTabId = 'prompt' | 'ontology' | 'dictionary' | 'unified';

const TABS: { id: ConvaiTabId; label: string }[] = [
  { id: 'prompt', label: 'System prompt' },
  { id: 'ontology', label: 'Ontologia' },
  { id: 'dictionary', label: 'Dizionario' },
  { id: 'unified', label: 'KB unificato' },
];

const TAB_HINTS: Record<ConvaiTabId, string> = {
  prompt: 'Incolla nel campo System prompt dell\'agente Convai.',
  ontology: 'Carica come documento knowledge base (ontologia prestazioni).',
  dictionary: 'Carica come documento knowledge base (vocabolario token).',
  unified: 'Carica come unico documento JSON (dizionario + ontologia).',
};

export interface ConvaiExportPanelProps {
  documentName: string;
  dictionary: TokenDictionary;
  descriptions: string[];
  analysis: Analysis | null;
  dictionaryDirty?: boolean;
  analysisDirty?: boolean;
  pathsOutOfSync?: boolean;
  onClose: () => void;
}

export function ConvaiExportPanel({
  documentName,
  dictionary,
  descriptions,
  analysis,
  dictionaryDirty,
  analysisDirty,
  pathsOutOfSync,
  onClose,
}: ConvaiExportPanelProps) {
  const [activeTab, setActiveTab] = useState<ConvaiTabId>('prompt');
  const [copiedTab, setCopiedTab] = useState<ConvaiTabId | null>(null);

  const exportData = useMemo(
    () => buildConvaiFullExport({
      documentName,
      dictionary,
      descriptions,
      analysis,
      dictionaryDirty,
      analysisDirty,
      pathsOutOfSync,
    }),
    [documentName, dictionary, descriptions, analysis, dictionaryDirty, analysisDirty, pathsOutOfSync],
  );

  const tabContent: Record<ConvaiTabId, string> = useMemo(() => ({
    prompt: exportData.systemPrompt,
    ontology: exportData.ontologyJson,
    dictionary: exportData.dictionaryJson,
    unified: exportData.unifiedKbJson,
  }), [exportData]);

  const copyTab = useCallback(async (tab: ConvaiTabId) => {
    const text = tabContent[tab];
    await navigator.clipboard.writeText(text);
    setCopiedTab(tab);
    window.setTimeout(() => setCopiedTab((prev) => (prev === tab ? null : prev)), 2000);
  }, [tabContent]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[10060] flex items-center justify-center p-4 bg-black/65 backdrop-blur-[1px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-4xl h-[min(85vh,720px)] flex flex-col rounded border border-[#1a3a2a] bg-[#0a1510] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="convai-export-title"
      >
        <div className="flex-shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-[#1a3a2a]">
          <div className="flex items-center gap-2 min-w-0">
            <Mic className="w-4 h-4 text-violet-300 flex-shrink-0" />
            <h2 id="convai-export-title" className="font-mono text-xs text-emerald-100">
              Export Convai
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-emerald-400/60 hover:text-emerald-200"
            title="Chiudi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {exportData.warnings.length > 0 && (
          <div className="flex-shrink-0 px-4 py-2 border-b border-amber-400/20 bg-amber-400/5">
            <ul className="font-mono text-[10px] text-amber-200/90 space-y-0.5">
              {exportData.warnings.map((w) => (
                <li key={w}>• {w}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex-shrink-0 flex items-center gap-1 px-3 py-2 border-b border-[#1a3a2a] overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-shrink-0 px-3 py-1.5 font-mono text-[10px] rounded border transition-colors ${
                activeTab === tab.id
                  ? 'border-violet-400/50 bg-violet-400/15 text-violet-200'
                  : 'border-transparent text-emerald-400/50 hover:text-emerald-300/80 hover:bg-emerald-400/5'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-shrink-0 px-4 py-2 border-b border-[#1a3a2a] flex items-center justify-between gap-2">
          <p className="font-mono text-[10px] text-emerald-400/50">{TAB_HINTS[activeTab]}</p>
          <button
            type="button"
            onClick={() => void copyTab(activeTab)}
            className="flex items-center gap-1.5 px-2.5 py-1 font-mono text-[10px] rounded border border-sky-400/35 text-sky-200/90 hover:bg-sky-400/10 transition-colors"
          >
            {copiedTab === activeTab ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                Copiato
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                Copia
              </>
            )}
          </button>
        </div>

        <pre className="flex-1 min-h-0 overflow-auto px-4 py-3 font-mono text-[11px] leading-relaxed text-emerald-100/90 whitespace-pre-wrap break-words">
          {tabContent[activeTab]}
        </pre>
      </div>
    </div>,
    document.body,
  );
}
