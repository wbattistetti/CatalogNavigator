/**
 * Modal panel for ElevenLabs ConvAI dumb-relay deploy.
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ChevronDown, Mic, X } from 'lucide-react';
import { ConvaiDeployForm } from './ConvaiDeployForm';
import { compileAgentBundle } from '../../lib/compileAgentBundle';
import type { Analysis } from '../../lib/analysisTypes';
import type { LoadedDictionaryRef } from '../../lib/multiDictionarySegment';
import type { TokenDictionary } from '../../lib/tokenDictionary';

export interface ConvaiExportPanelProps {
  documentId: string;
  documentName: string;
  dictionary: TokenDictionary;
  descriptions: string[];
  analysis: Analysis | null;
  loadedRefs?: LoadedDictionaryRef[];
  dictionaryDirty?: boolean;
  analysisDirty?: boolean;
  pathsOutOfSync?: boolean;
  onClose: () => void;
}

export function ConvaiExportPanel({
  documentId,
  documentName,
  dictionary,
  descriptions,
  analysis,
  loadedRefs,
  dictionaryDirty,
  analysisDirty,
  pathsOutOfSync,
  onClose,
}: ConvaiExportPanelProps) {
  const [warningsOpen, setWarningsOpen] = useState(false);

  const exportInput = useMemo(() => ({
    documentName,
    dictionary,
    descriptions,
    analysis,
    loadedRefs,
    dictionaryDirty,
    analysisDirty,
    pathsOutOfSync,
  }), [documentName, dictionary, descriptions, analysis, loadedRefs, dictionaryDirty, analysisDirty, pathsOutOfSync]);

  const bundleWarnings = useMemo(() => {
    if (!analysis) return [] as string[];
    try {
      const bundle = compileAgentBundle({ ...exportInput, mode: 'preview' });
      return bundle.meta.warnings;
    } catch {
      return [] as string[];
    }
  }, [exportInput, analysis]);

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
        className="w-full max-w-lg flex flex-col rounded border border-[#1a3a2a] bg-[#0a1510] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="convai-export-title"
      >
        <div className="flex-shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-[#1a3a2a]">
          <div className="flex items-center gap-2 min-w-0">
            <Mic className="w-4 h-4 text-violet-300 flex-shrink-0" />
            <h2 id="convai-export-title" className="font-mono text-xs text-emerald-100">
              Deploy ConvAI
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

        {bundleWarnings.length > 0 && (
          <div className="flex-shrink-0 border-b border-amber-400/20 bg-amber-400/5">
            <button
              type="button"
              onClick={() => setWarningsOpen((open) => !open)}
              className="w-full flex items-center justify-between gap-2 px-4 py-2 text-left hover:bg-amber-400/5 transition-colors"
              aria-expanded={warningsOpen}
            >
              <span className="flex items-center gap-2 font-mono text-[10px] text-amber-200/90">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                {bundleWarnings.length} avvisi bundle (non bloccano il deploy)
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 flex-shrink-0 text-amber-300/70 transition-transform ${warningsOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {warningsOpen && (
              <ul className="px-4 pb-2 font-mono text-[10px] text-amber-200/90 space-y-0.5 max-h-40 overflow-y-auto">
                {bundleWarnings.map((w) => (
                  <li key={w}>• {w}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex-shrink-0 px-4 py-2 border-b border-[#1a3a2a]">
          <p className="font-mono text-[10px] text-emerald-400/50">
            Voice relay: STT/TTS ElevenLabs, logica dialogo su webhook agent_dialog_step (gateway :3110 + ngrok).
          </p>
        </div>

        <div className="flex-1 min-h-0 overflow-auto px-4 py-3">
          <ConvaiDeployForm
            documentId={documentId}
            documentName={documentName}
            dictionary={dictionary}
            descriptions={descriptions}
            analysis={analysis}
            loadedRefs={loadedRefs}
            dictionaryDirty={dictionaryDirty}
            analysisDirty={analysisDirty}
            pathsOutOfSync={pathsOutOfSync}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
