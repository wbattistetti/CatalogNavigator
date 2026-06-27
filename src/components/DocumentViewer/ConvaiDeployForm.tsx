/**
 * ConvAI dumb-relay deploy: radio create/overwrite, agent list, single deploy action.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Radio } from 'lucide-react';
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

export type DeployMode = 'create' | 'overwrite';

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
  const suggestedName = useMemo(
    () => suggestConvaiAgentName(documentName),
    [documentName],
  );

  const [deployMode, setDeployMode] = useState<DeployMode>('create');
  const [agentName, setAgentName] = useState(suggestedName);
  const [targetAgentId, setTargetAgentId] = useState(NEW_AGENT_TARGET);
  const [remoteAgents, setRemoteAgents] = useState<ConvaiAgentSummary[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsLoaded, setAgentsLoaded] = useState(false);
  const [agentSearch, setAgentSearch] = useState('');
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [linkLoaded, setLinkLoaded] = useState(false);

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

  const isAgentUpdate = deployMode === 'overwrite' && targetAgentId !== NEW_AGENT_TARGET;

  const resolvedAgentName = agentName.trim() || suggestedName;

  useEffect(() => {
    void loadConvaiAgentLink(documentId).then((link) => {
      if (link?.agentId) {
        setDeployMode('overwrite');
        setTargetAgentId(link.agentId);
        setAgentName(link.agentName ?? suggestedName);
      } else {
        setDeployMode('create');
        setAgentName(suggestedName);
      }
      if (link?.publicBaseUrl) setTunnelUrl(link.publicBaseUrl);
      setLinkLoaded(true);
    }).catch(() => {
      setAgentName(suggestedName);
      setLinkLoaded(true);
    });
    void fetchNgrokStatus().then((s) => {
      if (s.publicUrl) setTunnelUrl(s.publicUrl);
    }).catch(() => {});
  }, [documentId, suggestedName]);

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

  useEffect(() => {
    if (deployMode === 'overwrite' && !agentsLoaded && !agentsLoading && linkLoaded) {
      void loadRemoteAgents();
    }
  }, [deployMode, agentsLoaded, agentsLoading, linkLoaded, loadRemoteAgents]);

  const selectDeployMode = useCallback((mode: DeployMode) => {
    setDeployMode(mode);
    setError(null);
    if (mode === 'create') {
      setTargetAgentId(NEW_AGENT_TARGET);
      setAgentName(suggestedName);
    }
  }, [suggestedName]);

  const selectOverwriteAgent = useCallback((agent: ConvaiAgentSummary) => {
    setTargetAgentId(agent.agentId);
    setAgentName(agent.displayName || agent.name);
  }, []);

  const filteredAgents = useMemo(() => {
    const q = agentSearch.trim().toLowerCase();
    if (!q) return remoteAgents;
    return remoteAgents.filter((agent) => (
      agent.displayName.toLowerCase().includes(q)
      || agent.name.toLowerCase().includes(q)
      || agent.agentId.toLowerCase().includes(q)
    ));
  }, [agentSearch, remoteAgents]);

  const deployLabel = useMemo(() => {
    if (isAgentUpdate) {
      return `Deploy — sovrascrivi «${resolvedAgentName}»`;
    }
    return `Deploy — crea «${resolvedAgentName}»`;
  }, [isAgentUpdate, resolvedAgentName]);

  const runDeploy = useCallback(async () => {
    if (!bundlePreview) {
      setError('Bundle non compilabile.');
      return;
    }
    if (deployMode === 'overwrite' && !targetAgentId) {
      setError('Seleziona un agente da sovrascrivere.');
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
        agentName: resolvedAgentName,
        bundle: bundlePreview,
        targetAgentId: isAgentUpdate ? targetAgentId : undefined,
        priorLink,
      });
      setDeployMode('overwrite');
      setTargetAgentId(result.agentId);
      setAgentName(result.link.agentName);
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
    bundlePreview,
    deployMode,
    documentId,
    isAgentUpdate,
    resolvedAgentName,
    targetAgentId,
  ]);

  return (
    <div className="space-y-3 font-mono text-[11px] text-emerald-100/90">
      {!bundlePreview && (
        <p className="text-amber-200/90">Ontologia mancante — impossibile deployare.</p>
      )}

      <fieldset className="space-y-2">
        <legend className="text-emerald-400/60">Modalità deploy</legend>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="deployMode"
            checked={deployMode === 'create'}
            onChange={() => selectDeployMode('create')}
            className="accent-violet-400"
          />
          <span>Nuovo agente</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="deployMode"
            checked={deployMode === 'overwrite'}
            onChange={() => selectDeployMode('overwrite')}
            className="accent-violet-400"
          />
          <span>Sovrascrivi agente</span>
        </label>
      </fieldset>

      <label className="block space-y-1">
        <span className="text-emerald-400/60">Nome agente</span>
        <input
          className="w-full px-2 py-1.5 rounded border border-[#1a3a2a] bg-black/30"
          value={agentName}
          onChange={(e) => setAgentName(e.target.value)}
        />
        {deployMode === 'create' && (
          <p className="text-[10px] text-emerald-400/45">
            Proposta: {suggestedName}
          </p>
        )}
      </label>

      {deployMode === 'overwrite' && (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-emerald-400/60">Agente ElevenLabs</span>
            <button
              type="button"
              disabled={agentsLoading}
              onClick={() => void loadRemoteAgents()}
              className="text-[10px] text-violet-300/80 hover:text-violet-200 disabled:opacity-50"
            >
              {agentsLoading ? 'Caricamento…' : agentsLoaded ? 'Aggiorna lista' : 'Carica agenti'}
            </button>
          </div>
          <input
            type="search"
            value={agentSearch}
            onChange={(e) => setAgentSearch(e.target.value)}
            placeholder="Cerca agenti…"
            className="w-full px-2 py-1 rounded border border-[#1a3a2a] bg-black/40 text-[10px] placeholder:text-emerald-400/35"
          />
          <ul
            role="listbox"
            className="max-h-40 overflow-y-auto rounded border border-[#1a3a2a] bg-black/20 py-1"
          >
            {agentsLoading && remoteAgents.length === 0 && (
              <li className="px-2 py-1.5 text-emerald-400/45">Caricamento agenti…</li>
            )}
            {filteredAgents.map((agent) => {
              const selected = agent.agentId === targetAgentId;
              return (
                <li key={agent.agentId} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    onClick={() => selectOverwriteAgent(agent)}
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
                  onClick={() => setTargetAgentId(targetAgentId)}
                  className="w-full text-left px-2 py-1.5 bg-violet-400/15 text-violet-200 truncate"
                >
                  {targetAgentId}
                </button>
              </li>
            )}
            {!agentsLoading && agentsLoaded && filteredAgents.length === 0 && (
              <li className="px-2 py-1.5 text-emerald-400/45">Nessun agente trovato</li>
            )}
          </ul>
        </div>
      )}

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
        disabled={busy || !bundlePreview || (deployMode === 'overwrite' && !targetAgentId)}
        onClick={() => void runDeploy()}
        className="px-4 py-2 rounded border border-sky-400/40 text-sky-200 hover:bg-sky-400/10 disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : null}
        {' '}
        {deployLabel}
      </button>

      <p className="text-emerald-400/45 text-[10px]">
        ngrok da backend/.env. Gateway: npm run be:gateway. Al redeploy aggiorna lo stesso tool workspace (non ne crea uno nuovo).
      </p>
    </div>
  );
}
