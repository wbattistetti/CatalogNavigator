/**
 * Document editor shell: fast tab strip + stacked workspaces; drag tab to split.
 */
import { useDocumentEditorController, useDocumentEditorTab } from './DocumentEditorContext';
import { DocumentEditorHeader } from './DocumentEditorHeader';
import { DocumentEditorToolbar } from './DocumentEditorToolbar';
import { DocumentEditorTabStrip } from './DocumentEditorTabStrip';
import { DocumentEditorWorkspace } from './DocumentEditorWorkspace';
import { EDITOR_TAB_IDS } from './editorTabIds';

function AgentGenerationProgress() {
  const { analysisApi } = useDocumentEditorController();
  const { generating, generatingPhase, agentGenProgress } = analysisApi;

  if (!generating || (generatingPhase !== 'messages' && generatingPhase !== 'grammars') || !agentGenProgress) {
    return null;
  }

  return (
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
  );
}

export function DocumentEditorShell() {
  const { activeTab } = useDocumentEditorTab();

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      <DocumentEditorHeader />

      <div className="flex-shrink-0 flex items-end justify-between gap-2 px-2 border-b border-[#1a3a2a] bg-[#080e0a]">
        <DocumentEditorTabStrip />
        <DocumentEditorToolbar />
      </div>

      {activeTab === EDITOR_TAB_IDS.agent && <AgentGenerationProgress />}

      <DocumentEditorWorkspace />
    </div>
  );
}
