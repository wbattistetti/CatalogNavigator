/**
 * Deploy form and modal for ConvAI without backend: structured KB + algorithm system prompt.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Loader2, Mic, X } from 'lucide-react';
import { compileAgentBundle } from '../../lib/compileAgentBundle';
import type { Analysis } from '../../lib/analysisTypes';
import type { LoadedDictionaryRef } from '../../lib/multiDictionarySegment';
import type { TokenDictionary } from '../../lib/tokenDictionary';
import { publishAgentBundle } from '../../lib/persistAgentBundle';
import { loadConvaiAgentLink } from '../../lib/convaiSync/convaiAgentLink';
import {
  listConvaiAgents,
  type ConvaiAgentSummary,
} from '../../lib/convaiSync/convaiProvisionApi';
import { suggestConvaiAgentName } from '../../lib/convaiSync/convaiAgentName';
import { syncConvaiAgentNoBackend } from '../../lib/convaiSync/syncConvaiAgentNoBackend';
import { NEW_AGENT_TARGET } from './ConvaiDeployForm';

export interface ConvaiNoBeDeployFormProps {
  documentId: string;
  documentName: string;
  dictionary: TokenDictionary;
  descriptions: string[];
  analysis: Analysis | null;
  loadedRefs?: LoadedDictionaryRef[];
  dictionaryDirty?: boolean;
  analysisDirty?: boolean;
  pathsOutOfSync?: boolean;
}

export function ConvaiNoBeDeployForm({
  documentId,
  documentName,
  dictionary,
  descriptions,
  analysis,
  loadedRefs,
  dictionaryDirty,
  analysisDirty,
  pathsOutOfSync,
}: ConvaiNoBeDeployFormProps) {
  const [agentName, setAgentName] = useState(() => `${suggestConvaiAgentName(documentName)} (no be)`);
  const [targetAgentId, setTargetAgentId] = useState(NEW_AGENT_TARGET);
  const [remoteAgents, setRemoteAgents] = useState<ConvaiAgentSummary[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsLoaded, setAgentsLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [targetMenuOpen, setTargetMenuOpen] = useState(false);
  const [agentSearch, setAgentSearch] = useState('');
  const targetMenuRef = useRef<HTMLDivElement>(null);

  const bundlePreview = useMemo(() => {
    if (!analysis) return null;
    try {
      return compileAgentBundle({
        documentName,
        documentId,
        mode: 'preview',
        dictionary,
        descriptions,
        analysis,
        loadedRefs,
        dictionaryDirty,
        analysisDirty,
        pathsOutOfSync,
      });
    } catch {
      return null;
    }
  }, [
    documentName,
    documentId,
    dictionary,
    descriptions,
    analysis,
    loadedRefs,
    dictionaryDirty,
    analysisDirty,
    pathsOutOfSync,
  ]);

  const isAgentUpdate = targetAgentId !== NEW_AGENT_TARGET;

  useEffect(() => {
    void loadConvaiAgentLink(documentId).then((link) => {
      if (link?.deployMode === 'no-backend') {
        setAgentName(link.agentName ?? `${suggestConvaiAgentName(documentName)} (no be)`);
        if (link.agentId) setTargetAgentId(link.agentId);
        return;
      }
      setAgentName(`${suggestConvaiAgentName(documentName)} (no be)`);
    }).catch(() => {
      setAgentName(`${suggestConvaiAgentName(documentName)} (no be)`);
    });
  }, [documentId, documentName]);

  useEffect(() => {
    if (!targetMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (targetMenuRef.current && !targetMenuRef.current.contains(e.target as Node)) {
        setTargetMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [targetMenuOpen]);

  const loadRemoteAgents = useCallback(async () => {
    if (agentsLoading) return;
    setAgentsLoading(true);
    setError(null);
    try {
      const agents = await listConvaiAgents();
      setRemoteAgents(agents);
      setAgentsLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAgentsLoading(false);
    }
  }, [agentsLoading]);

  const runDeploy = useCallback(async () => {
    if (!bundlePreview) {
      setError('Bundle non compilabile.');
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const priorLink = await loadConvaiAgentLink(documentId).catch(() => null);
      await publishAgentBundle(documentId, {
        ...bundlePreview,
        meta: { ...bundlePreview.meta, mode: 'published', documentId },
      });
      const result = await syncConvaiAgentNoBackend({
        documentId,
        agentName: agentName.trim() || `${suggestConvaiAgentName(documentName)} (no be)`,
        bundle: bundlePreview,
        targetAgentId: isAgentUpdate ? targetAgentId : undefined,
        priorLink,
      });
      setTargetAgentId(result.agentId);
      setSuccess(
        result.isAgentUpdate
          ? `Agente no-backend aggiornato: ${result.agentId} (${result.kbItemCount} ITEM in KB)`
          : `Nuovo agente no-backend creato: ${result.agentId} (${result.kbItemCount} ITEM in KB)`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [
    agentName,
    bundlePreview,
    documentId,
    documentName,
    isAgentUpdate,
    targetAgentId,
  ]);

  const targetLabel = useMemo(() => {
    if (!isAgentUpdate) return 'Nuovo agente';
    const found = remoteAgents.find((a) => a.agentId === targetAgentId);
    if (found) return found.displayName;
    return targetAgentId;
  }, [isAgentUpdate, remoteAgents, targetAgentId]);

  const filteredAgents = useMemo(() => {
    const q = agentSearch.trim().toLowerCase();
    if (!q) return remoteAgents;
    return remoteAgents.filter((agent) => (
      agent.displayName.toLowerCase().includes(q)
      || agent.name.toLowerCase().includes(q)
      || agent.agentId.toLowerCase().includes(q)
    ));
  }, [agentSearch, remoteAgents]);

  const openTargetMenu = useCallback(() => {
    setTargetMenuOpen((open) => !open);
    if (!agentsLoaded) void loadRemoteAgents();
  }, [agentsLoaded, loadRemoteAgents]);

  const selectTarget = useCallback((agentId: string) => {
    setTargetAgentId(agentId);
    setTargetMenuOpen(false);
    setAgentSearch('');
  }, []);

  return (
    <div className="space-y-3 font-mono text-[11px] text-emerald-100/90">
      {!bundlePreview && (
        <p className="text-amber-200/90">Ontologia mancante — impossibile deployare.</p>
      )}

      <p className="text-emerald-400/55 text-[10px] leading-relaxed">
        Nessun webhook né ngrok. System prompt con algoritmo T1–T10 + KB strutturata tokenizzata su ElevenLabs.
        Richiede gateway locale (npm run be:gateway).
      </p>

      <label className="block space-y-1">
        <span className="text-emerald-400/60">Nome agente</span>
        <input
          className="w-full px-2 py-1.5 rounded border border-[#1a3a2a] bg-black/30"
          value={agentName}
          onChange={(e) => setAgentName(e.target.value)}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-emerald-400/60">Agente target</span>
        <div className="relative" ref={targetMenuRef}>
          <button
            type="button"
            onClick={() => openTargetMenu()}
            className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded border border-[#1a3a2a] bg-black/30 text-left hover:bg-emerald-400/5 transition-colors"
            aria-haspopup="listbox"
            aria-expanded={targetMenuOpen}
          >
            <span className="truncate">{targetLabel}</span>
            <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 text-emerald-400/50 transition-transform ${targetMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          {targetMenuOpen && (
            <div className="absolute z-20 mt-1 w-full rounded border border-[#1a3a2a] bg-[#0a1510] shadow-lg shadow-black/50 overflow-hidden">
              <div className="p-1.5 border-b border-[#1a3a2a]">
                <input
                  type="search"
                  value={agentSearch}
                  onChange={(e) => setAgentSearch(e.target.value)}
                  placeholder="Cerca agenti…"
                  className="w-full px-2 py-1 rounded border border-[#1a3a2a] bg-black/40 text-[10px] placeholder:text-emerald-400/35"
                />
              </div>
              <ul role="listbox" className="max-h-52 overflow-y-auto py-1">
                <li role="option" aria-selected={!isAgentUpdate}>
                  <button
                    type="button"
                    onClick={() => selectTarget(NEW_AGENT_TARGET)}
                    className={`w-full text-left px-2 py-1.5 transition-colors ${
                      !isAgentUpdate
                        ? 'bg-amber-400/15 text-amber-200'
                        : 'text-emerald-100/90 hover:bg-emerald-400/10'
                    }`}
                  >
                    Nuovo agente
                  </button>
                </li>
                {agentsLoading && remoteAgents.length === 0 && (
                  <li className="px-2 py-1.5 text-emerald-400/45">Caricamento agenti…</li>
                )}
                {filteredAgents.map((agent) => {
                  const selected = agent.agentId === targetAgentId;
                  return (
                    <li key={agent.agentId} role="option" aria-selected={selected}>
                      <button
                        type="button"
                        onClick={() => selectTarget(agent.agentId)}
                        className={`w-full text-left px-2 py-1.5 transition-colors ${
                          selected
                            ? 'bg-amber-400/15 text-amber-200'
                            : 'text-emerald-100/90 hover:bg-emerald-400/10'
                        }`}
                      >
                        <span className="truncate">{agent.displayName}</span>
                      </button>
                    </li>
                  );
                })}
                {isAgentUpdate && !remoteAgents.some((a) => a.agentId === targetAgentId) && (
                  <li role="option" aria-selected>
                    <button
                      type="button"
                      onClick={() => selectTarget(targetAgentId)}
                      className="w-full text-left px-2 py-1.5 bg-amber-400/15 text-amber-200 truncate"
                    >
                      {targetLabel}
                    </button>
                  </li>
                )}
                {!agentsLoading && agentsLoaded && filteredAgents.length === 0 && (
                  <li className="px-2 py-1.5 text-emerald-400/45">Nessun agente trovato</li>
                )}
              </ul>
            </div>
          )}
        </div>
        <button
          type="button"
          disabled={agentsLoading}
          onClick={() => void loadRemoteAgents()}
          className="text-[10px] text-amber-300/80 hover:text-amber-200 disabled:opacity-50"
        >
          {agentsLoading ? 'Caricamento agenti…' : agentsLoaded ? 'Aggiorna lista agenti' : 'Carica agenti ElevenLabs'}
        </button>
      </label>

      {error && <p className="text-red-300/90">{error}</p>}
      {success && (
        <p className="text-emerald-300/90 flex items-center gap-1">
          <Check className="w-3 h-3" />
          {success}
        </p>
      )}

      <button
        type="button"
        disabled={busy || !bundlePreview}
        onClick={() => void runDeploy()}
        className="px-4 py-2 rounded border border-amber-400/40 text-amber-200 hover:bg-amber-400/10 disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : null}
        {' '}
        {isAgentUpdate ? 'Convalida no be — aggiorna agente' : 'Convalida no be — nuovo agente'}
      </button>
    </div>
  );
}

/**
 * Modal panel for Convalida no be deploy (structured KB + algorithm prompt, no webhook).
 */
export interface ConvaiNoBeExportPanelProps {
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

export function ConvaiNoBeExportPanel(props: ConvaiNoBeExportPanelProps) {
  const { onClose, ...formProps } = props;

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
        aria-labelledby="convai-nobe-title"
      >
        <div className="flex-shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-[#1a3a2a]">
          <div className="flex items-center gap-2 min-w-0">
            <Mic className="w-4 h-4 text-amber-300 flex-shrink-0" />
            <h2 id="convai-nobe-title" className="font-mono text-xs text-emerald-100">
              Convalida no be
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
        <div className="flex-1 min-h-0 overflow-auto px-4 py-3">
          <ConvaiNoBeDeployForm {...formProps} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
