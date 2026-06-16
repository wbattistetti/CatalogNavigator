/**
 * Designer-friendly ConvAI deploy: nome agente + target dropdown + deploy unico.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, Radio } from 'lucide-react';
import { compileAgentBundle } from '../../lib/compileAgentBundle';
import type { Analysis } from '../../lib/analysisTypes';
import type { LoadedDictionaryRef } from '../../lib/multiDictionarySegment';
import type { TokenDictionary } from '../../lib/tokenDictionary';
import { publishAgentBundle } from '../../lib/persistAgentBundle';
import { loadConvaiAgentLink } from '../../lib/convaiSync/convaiAgentLink';
import { fetchNgrokStatus } from '../../lib/convaiSync/convaiDevTunnel';
import {
  listConvaiAgents,
  type ConvaiAgentSummary,
} from '../../lib/convaiSync/convaiProvisionApi';
import { suggestConvaiAgentName } from '../../lib/convaiSync/convaiAgentName';
import { syncConvaiAgentFromBundle } from '../../lib/convaiSync/syncConvaiAgent';

export const NEW_AGENT_TARGET = '';

export interface ConvaiDeployFormProps {
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

export function ConvaiDeployForm({
  documentId,
  documentName,
  dictionary,
  descriptions,
  analysis,
  loadedRefs,
  dictionaryDirty,
  analysisDirty,
  pathsOutOfSync,
}: ConvaiDeployFormProps) {
  const [agentName, setAgentName] = useState(() => suggestConvaiAgentName(documentName));
  const [targetAgentId, setTargetAgentId] = useState(NEW_AGENT_TARGET);
  const [remoteAgents, setRemoteAgents] = useState<ConvaiAgentSummary[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsLoaded, setAgentsLoaded] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
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
      setAgentName(link?.agentName ?? suggestConvaiAgentName(documentName));
      if (link?.agentId) setTargetAgentId(link.agentId);
      if (link?.publicBaseUrl) setTunnelUrl(link.publicBaseUrl);
    }).catch(() => {
      setAgentName(suggestConvaiAgentName(documentName));
    });
    void fetchNgrokStatus().then((s) => {
      if (s.publicUrl) setTunnelUrl(s.publicUrl);
    }).catch(() => {});
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
      const result = await syncConvaiAgentFromBundle({
        documentId,
        agentName: agentName.trim() || suggestConvaiAgentName(documentName),
        bundle: bundlePreview,
        targetAgentId: isAgentUpdate ? targetAgentId : undefined,
        priorLink,
      });
      setTargetAgentId(result.agentId);
      setTunnelUrl(result.publicBaseUrl);
      setSuccess(
        result.isAgentUpdate
          ? `Agente aggiornato: ${result.agentId}`
          : `Nuovo agente creato: ${result.agentId}`,
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
                        ? 'bg-violet-400/15 text-violet-200'
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
                            ? 'bg-violet-400/15 text-violet-200'
                            : 'text-emerald-100/90 hover:bg-emerald-400/10'
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate">{agent.displayName}</span>
                          {agent.last7DayCallCount > 0 && (
                            <span className="flex-shrink-0 text-[9px] text-emerald-400/45">
                              {agent.last7DayCallCount}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
                {isAgentUpdate && !remoteAgents.some((a) => a.agentId === targetAgentId) && (
                  <li role="option" aria-selected>
                    <button
                      type="button"
                      onClick={() => selectTarget(targetAgentId)}
                      className="w-full text-left px-2 py-1.5 bg-violet-400/15 text-violet-200 truncate"
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
          className="text-[10px] text-violet-300/80 hover:text-violet-200 disabled:opacity-50"
        >
          {agentsLoading ? 'Caricamento agenti…' : agentsLoaded ? 'Aggiorna lista agenti' : 'Carica agenti ElevenLabs'}
        </button>
      </label>

      {tunnelUrl && (
        <p className="text-sky-200/80 flex items-center gap-1">
          <Radio className="w-3 h-3" />
          Tunnel: {tunnelUrl}
        </p>
      )}

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
        className="px-4 py-2 rounded border border-sky-400/40 text-sky-200 hover:bg-sky-400/10 disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : null}
        {' '}
        {isAgentUpdate ? 'Deploy — sovrascrivi agente' : 'Deploy — nuovo agente'}
      </button>

      <p className="text-emerald-400/45 text-[10px]">
        ngrok da backend/.env. Gateway: npm run be:gateway. Runtime su webhook — nessuna KB ElevenLabs.
      </p>
    </div>
  );
}
