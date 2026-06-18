/**
 * Outer dock panel bodies: drag/split via Dockview, keep-alive via retained mount.
 */
import { Loader2 } from 'lucide-react';
import type { IDockviewPanelProps } from 'dockview';
import { DictionariesWorkspace } from '../dictionaries/DictionariesWorkspace';
import { AgentWorkspace } from '../agent/AgentWorkspace';
import { OntologyWorkspace } from '../ontology/OntologyWorkspace';
import { DockPanelRetained } from './dock/DockPanelRetained';
import { useDocumentPanelMount } from './dock/useDocumentPanelMount';
import { useDocumentEditorController } from './DocumentEditorContext';
import { DocumentWorkspace } from './DocumentWorkspace';
import { EDITOR_TAB_IDS } from './editorTabIds';

function LoadingPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-full gap-2 text-emerald-400/30 font-mono text-sm">
      <Loader2 className="w-4 h-4 animate-spin" />
      {label}
    </div>
  );
}

export function DocumentDockPanel(props: IDockviewPanelProps) {
  const mounted = useDocumentPanelMount(EDITOR_TAB_IDS.document, props.api);

  return (
    <DockPanelRetained mounted={mounted}>
      <DocumentWorkspace />
    </DockPanelRetained>
  );
}

export function DictionariesDockPanel(props: IDockviewPanelProps) {
  const mounted = useDocumentPanelMount(EDITOR_TAB_IDS.dictionaries, props.api);
  const { content, dicts } = useDocumentEditorController();

  return (
    <DockPanelRetained mounted={mounted}>
      {content.loading && dicts.loading
        ? <LoadingPlaceholder label="Caricamento…" />
        : <DictionariesWorkspace />}
    </DockPanelRetained>
  );
}

export function OntologyDockPanel(props: IDockviewPanelProps) {
  const mounted = useDocumentPanelMount(EDITOR_TAB_IDS.ontology, props.api);
  const { content } = useDocumentEditorController();

  return (
    <DockPanelRetained mounted={mounted}>
      {content.loading
        ? <LoadingPlaceholder label="Caricamento tabella…" />
        : <OntologyWorkspace />}
    </DockPanelRetained>
  );
}

export function AgentDockPanel(props: IDockviewPanelProps) {
  const mounted = useDocumentPanelMount(EDITOR_TAB_IDS.agent, props.api);

  return (
    <DockPanelRetained mounted={mounted}>
      <AgentWorkspace />
    </DockPanelRetained>
  );
}

export const DOCUMENT_EDITOR_DOCK_COMPONENTS = {
  document: DocumentDockPanel,
  dictionaries: DictionariesDockPanel,
  ontology: OntologyDockPanel,
  agent: AgentDockPanel,
} as const;
