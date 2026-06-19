/**
 * Decides when an outer document-editor dock panel body should mount.
 * Combines first-visit retention with idle prefetch of sibling workspaces.
 */
import type { DockviewPanelApi } from 'dockview';
import { useWorkspaceEagerMount } from '../../../hooks/useWorkspaceEagerMount';
import { useDocumentEditorController, useDocumentEditorTab } from '../DocumentEditorContext';
import type { EditorTabId } from '../editorTabIds';
import { useDockPanelRetained } from './useDockPanelRetained';

export function useDocumentPanelMount(panelId: EditorTabId, panelApi: DockviewPanelApi): boolean {
  const retained = useDockPanelRetained(panelApi);
  const { dictionaryMode, showOntologyTab, content } = useDocumentEditorController();
  const { activeTab } = useDocumentEditorTab();
  const eagerTabs = useWorkspaceEagerMount(
    activeTab,
    (dictionaryMode || showOntologyTab) && !!content.tabular,
  );

  return retained || eagerTabs.has(panelId);
}
