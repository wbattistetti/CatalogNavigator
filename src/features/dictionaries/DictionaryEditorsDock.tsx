/**
 * Nested Dockview inside the Dizionari panel: drag dictionary tabs to split editors.
 * Separate from the outer Documento / Dizionari / Ontologia / Agente dock.
 */
import { useCallback, useEffect, useRef } from 'react';
import { DockviewReact, type DockviewApi, type DockviewReadyEvent } from 'dockview';
import { useDocumentEditorController } from '../document-editor/DocumentEditorContext';
import { DICTIONARY_EDITOR_COMPONENTS } from './DictionaryEditorPanel';
import { DictionaryEditorTab } from './DictionaryEditorTab';
import { dictionaryEditorPanelId, parseDictionaryEditorPanelId } from '../../lib/dictionaryEditorDockPanelIds';
import { dictionaryTabDisplayName } from '../../lib/dictionaryTabOrder';

const DICTIONARY_DOCK_TAB_COMPONENTS = {
  dictionaryEditorTab: DictionaryEditorTab,
} as const;

function DictionaryDockWatermark() {
  return (
    <div className="flex items-center justify-center h-full font-mono text-xs text-emerald-300/85 px-6 text-center">
      Nessun dizionario caricato nel progetto.
      Usa <span className="text-amber-300 mx-1">Nuovo</span> o
      <span className="text-sky-300 mx-1">Carica dizionario da libreria</span> nella barra in alto.
    </div>
  );
}

function openIdsEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

export function DictionaryEditorsDock() {
  const { dicts } = useDocumentEditorController();
  const apiRef = useRef<DockviewApi | null>(null);
  const getDictionaryMetaRef = useRef(dicts.getDictionaryMeta);
  const focusDictionaryEditorRef = useRef(dicts.focusDictionaryEditor);
  const lastOpenIdsRef = useRef<string[]>([]);

  getDictionaryMetaRef.current = dicts.getDictionaryMeta;
  focusDictionaryEditorRef.current = dicts.focusDictionaryEditor;

  const syncPanels = useCallback((api: DockviewApi, openIds: string[]) => {
    const openSet = new Set(openIds);
    for (const panel of api.panels) {
      const dictId = parseDictionaryEditorPanelId(panel.id);
      if (dictId && !openSet.has(dictId)) {
        panel.api.close();
      }
    }

    let referenceId: string | undefined;
    for (const dictId of openIds) {
      const panelId = dictionaryEditorPanelId(dictId);
      if (api.getPanel(panelId)) {
        if (!referenceId) referenceId = panelId;
        continue;
      }
      const meta = getDictionaryMetaRef.current(dictId);
      if (!meta) continue;
      api.addPanel({
        id: panelId,
        component: 'dictionaryEditor',
        title: dictionaryTabDisplayName(meta),
        params: { dictionaryId: dictId },
        tabComponent: 'dictionaryEditorTab',
        position: referenceId
          ? { referencePanel: referenceId, direction: 'within' }
          : undefined,
      });
      if (!referenceId) referenceId = panelId;
    }
  }, []);

  const onReady = useCallback((event: DockviewReadyEvent) => {
    apiRef.current = event.api;
    lastOpenIdsRef.current = dicts.openEditorIds;
    syncPanels(event.api, dicts.openEditorIds);
  }, [dicts.openEditorIds, syncPanels]);

  useEffect(() => {
    if (!apiRef.current) return;
    if (openIdsEqual(lastOpenIdsRef.current, dicts.openEditorIds)) return;
    lastOpenIdsRef.current = dicts.openEditorIds;
    syncPanels(apiRef.current, dicts.openEditorIds);
  }, [dicts.openEditorIds, syncPanels]);

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;

    const disposable = api.onDidActivePanelChange(() => {
      const active = api.activePanel;
      if (!active) return;
      const dictId = parseDictionaryEditorPanelId(active.id);
      if (dictId) focusDictionaryEditorRef.current(dictId);
    });

    return () => disposable.dispose();
  }, []);

  useEffect(() => {
    const api = apiRef.current;
    const activeId = dicts.editingDictionaryId;
    if (!api || !activeId) return;
    const panel = api.getPanel(dictionaryEditorPanelId(activeId));
    if (panel && !panel.api.isActive) {
      panel.api.setActive();
    }
  }, [dicts.editingDictionaryId]);

  return (
    <div className="flex-1 min-h-0 w-full overflow-hidden">
      <DockviewReact
        className="dockview-theme-dark dictionaries-editor-dock h-full w-full"
        components={DICTIONARY_EDITOR_COMPONENTS}
        tabComponents={DICTIONARY_DOCK_TAB_COMPONENTS}
        watermarkComponent={DictionaryDockWatermark}
        onReady={onReady}
      />
    </div>
  );
}
