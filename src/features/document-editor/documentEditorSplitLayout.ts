/**
 * Side-by-side layout for main editor tabs (drag tab to workspace edge to split).
 */
import type { EditorTabId } from './editorTabIds';

export type EditorSplitLayout =
  | { type: 'single' }
  | { type: 'split'; primary: EditorTabId; secondary: EditorTabId; ratio: number };

export const EDITOR_TAB_DRAG_MIME = 'application/x-editor-tab';

export function editorTabDragPayload(tabId: EditorTabId): string {
  return tabId;
}

export function parseEditorTabDrag(dataTransfer: DataTransfer): EditorTabId | null {
  const raw = dataTransfer.getData(EDITOR_TAB_DRAG_MIME);
  return raw.length > 0 ? (raw as EditorTabId) : null;
}

export function normalizeSplitLayout(
  layout: EditorSplitLayout,
  visibleTabs: ReadonlySet<EditorTabId>,
): EditorSplitLayout {
  if (layout.type === 'single') return layout;
  if (!visibleTabs.has(layout.primary) || !visibleTabs.has(layout.secondary)) {
    return { type: 'single' };
  }
  if (layout.primary === layout.secondary) return { type: 'single' };
  return layout;
}

export function createSplitLayout(
  primary: EditorTabId,
  secondary: EditorTabId,
  ratio = 50,
): EditorSplitLayout {
  if (primary === secondary) return { type: 'single' };
  return {
    type: 'split',
    primary,
    secondary,
    ratio: Math.min(80, Math.max(20, ratio)),
  };
}
