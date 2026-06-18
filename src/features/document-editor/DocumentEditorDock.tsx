/**
 * Outer Dockview: Documento, Dizionari, Ontologia, Agente — draggable tabs and split.
 */
import { useCallback, useEffect, useRef } from 'react';
import { DockviewReact, type DockviewApi, type DockviewReadyEvent } from 'dockview';
import { useDocumentEditorController, useDocumentEditorTab } from './DocumentEditorContext';
import { EDITOR_TAB_IDS, type EditorTabId } from './editorTabIds';
import { DOCUMENT_EDITOR_DOCK_COMPONENTS } from './DocumentEditorDockPanels';
import { DocumentEditorDockTab } from './DocumentEditorDockTab';

const DOCUMENT_DOCK_TAB_COMPONENTS = {
  documentEditorTab: DocumentEditorDockTab,
} as const;

const PANEL_DEFS: Array<{
  id: EditorTabId;
  component: keyof typeof DOCUMENT_EDITOR_DOCK_COMPONENTS;
  title: string;
  dictionaryOnly?: boolean;
}> = [
  { id: EDITOR_TAB_IDS.document, component: 'document', title: 'Documento originale' },
  { id: EDITOR_TAB_IDS.dictionaries, component: 'dictionaries', title: 'Dizionari', dictionaryOnly: true },
  { id: EDITOR_TAB_IDS.ontology, component: 'ontology', title: 'Ontologia', dictionaryOnly: true },
];

function isEditorTabId(id: string): id is EditorTabId {
  return Object.values(EDITOR_TAB_IDS).includes(id as EditorTabId);
}

export function DocumentEditorDock() {
  const { dictionaryMode } = useDocumentEditorController();
  const { activeTab, setActiveTab } = useDocumentEditorTab();
  const apiRef = useRef<DockviewApi | null>(null);
  const rootPanelIdRef = useRef<string | null>(null);

  const syncPanels = useCallback((api: DockviewApi) => {
    const visibleDefs = PANEL_DEFS.filter((d) => !d.dictionaryOnly || dictionaryMode);

    for (const panel of [...api.panels]) {
      const stillVisible = visibleDefs.some((d) => d.id === panel.id);
      if (!stillVisible) panel.api.close();
    }

    let referenceId = rootPanelIdRef.current;
    if (referenceId && !api.getPanel(referenceId)) {
      referenceId = api.panels[0]?.id ?? null;
      rootPanelIdRef.current = referenceId;
    }

    for (const def of visibleDefs) {
      if (api.getPanel(def.id)) continue;
      api.addPanel({
        id: def.id,
        component: def.component,
        title: def.title,
        tabComponent: 'documentEditorTab',
        position: referenceId
          ? { referencePanel: referenceId, direction: 'within' }
          : undefined,
      });
      if (!referenceId) {
        referenceId = def.id;
        rootPanelIdRef.current = def.id;
      }
    }
  }, [dictionaryMode]);

  const onReady = useCallback((event: DockviewReadyEvent) => {
    apiRef.current = event.api;
    if (!rootPanelIdRef.current && event.api.panels.length > 0) {
      rootPanelIdRef.current = event.api.panels[0].id;
    }
    syncPanels(event.api);
  }, [syncPanels]);

  useEffect(() => {
    if (!apiRef.current) return;
    syncPanels(apiRef.current);
  }, [syncPanels]);

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    const panel = api.getPanel(activeTab);
    if (panel && !panel.api.isActive) {
      panel.api.setActive();
    }
  }, [activeTab]);

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;

    const disposable = api.onDidActivePanelChange(() => {
      const active = api.activePanel;
      if (active && isEditorTabId(active.id)) {
        setActiveTab(active.id);
      }
    });

    return () => disposable.dispose();
  }, [setActiveTab]);

  return (
    <div className="flex-1 min-h-0 w-full overflow-hidden">
      <DockviewReact
        className="dockview-theme-dark document-editor-dock h-full w-full"
        components={DOCUMENT_EDITOR_DOCK_COMPONENTS}
        tabComponents={DOCUMENT_DOCK_TAB_COMPONENTS}
        onReady={onReady}
      />
    </div>
  );
}
