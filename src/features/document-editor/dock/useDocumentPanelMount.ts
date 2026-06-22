/**
 * Decides when an outer document-editor dock panel body should mount.
 * Combines first-visit retention with visited-tab tracking from useWorkspaceEagerMount.
 */
import type { DockviewPanelApi } from 'dockview';
import { useWorkspaceEagerMount } from '../../../hooks/useWorkspaceEagerMount';
import { useDocumentEditorTab } from '../DocumentEditorContext';
import type { EditorTabId } from '../editorTabIds';
import { useDockPanelRetained } from './useDockPanelRetained';

export function useDocumentPanelMount(panelId: EditorTabId, panelApi: DockviewPanelApi): boolean {
  const retained = useDockPanelRetained(panelApi);
  const { activeTab } = useDocumentEditorTab();
  const eagerTabs = useWorkspaceEagerMount(activeTab);

  return retained || eagerTabs.has(panelId);
}
