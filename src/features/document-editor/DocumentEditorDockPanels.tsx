/**
 * Panel bodies registered with the outer document editor Dockview.
 */
import { Loader2 } from 'lucide-react';
import type { IDockviewPanelProps } from 'dockview';
import { DictionariesWorkspace } from '../dictionaries/DictionariesWorkspace';
import { AgentWorkspace } from '../agent/AgentWorkspace';
import { OntologyWorkspace } from '../ontology/OntologyWorkspace';
import { DocumentWorkspace } from './DocumentWorkspace';
import { useDocumentEditor } from './DocumentEditorContext';

export function DocumentDockPanel(_props: IDockviewPanelProps) {
  return (
    <div className="h-full min-h-0 flex flex-col">
      <DocumentWorkspace />
    </div>
  );
}

export function DictionariesDockPanel(_props: IDockviewPanelProps) {
  const { content, dicts } = useDocumentEditor();

  if (content.loading || dicts.loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-emerald-400/30 font-mono text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Caricamento…
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col">
      <DictionariesWorkspace />
    </div>
  );
}

export function OntologyDockPanel(_props: IDockviewPanelProps) {
  return (
    <div className="h-full min-h-0 flex flex-col">
      <OntologyWorkspace />
    </div>
  );
}

export function AgentDockPanel(_props: IDockviewPanelProps) {
  return (
    <div className="h-full min-h-0 flex flex-col">
      <AgentWorkspace />
    </div>
  );
}

export const DOCUMENT_EDITOR_DOCK_COMPONENTS = {
  document: DocumentDockPanel,
  dictionaries: DictionariesDockPanel,
  ontology: OntologyDockPanel,
  agent: AgentDockPanel,
} as const;
