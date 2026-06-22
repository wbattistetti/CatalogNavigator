/**
 * Fast stacked workspaces + optional side-by-side split (drag tab to edge).
 */
import { useCallback, useRef, useState } from 'react';
import { useWorkspaceEagerMount } from '../../hooks/useWorkspaceEagerMount';
import { useDocumentEditorController, useDocumentEditorTab } from './DocumentEditorContext';
import { createSplitLayout, type EditorSplitLayout } from './documentEditorSplitLayout';
import { EditorWorkspacePanel } from './EditorWorkspacePanel';
import { WorkspacePanel } from './WorkspacePanel';
import { EDITOR_TAB_IDS, type EditorTabId } from './editorTabIds';

type DropSide = 'left' | 'right';

function SplitDropOverlay({
  visible,
  side,
}: {
  visible: boolean;
  side: DropSide | null;
}) {
  if (!visible || !side) return null;

  return (
    <div
      className={`absolute inset-y-0 w-1/2 z-20 pointer-events-none border-2 border-emerald-400/70 bg-emerald-400/10 ${
        side === 'left' ? 'left-0' : 'right-0'
      }`}
    />
  );
}

function SplitWorkspace({
  layout,
  onRatioChange,
}: {
  layout: Extract<EditorSplitLayout, { type: 'split' }>;
  onRatioChange: (ratio: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [resizing, setResizing] = useState(false);

  const onSashPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    setResizing(true);
    const startX = e.clientX;
    const startRatio = layout.ratio;
    const width = container.getBoundingClientRect().width;

    const onMove = (ev: PointerEvent) => {
      const delta = ev.clientX - startX;
      const next = startRatio + (delta / width) * 100;
      onRatioChange(Math.min(80, Math.max(20, next)));
    };

    const onUp = () => {
      setResizing(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [layout.ratio, onRatioChange]);

  return (
    <div
      ref={containerRef}
      className={`flex h-full min-h-0 min-w-0 ${resizing ? 'select-none' : ''}`}
    >
      <div className="min-w-0 min-h-0 h-full flex flex-col overflow-hidden" style={{ width: `${layout.ratio}%` }}>
        <EditorWorkspacePanel tabId={layout.primary} mounted />
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        onPointerDown={onSashPointerDown}
        className="w-1 flex-shrink-0 cursor-col-resize bg-[#1a3a2a] hover:bg-emerald-400/45 transition-colors"
      />
      <div className="flex-1 min-w-0 min-h-0 h-full flex flex-col overflow-hidden">
        <EditorWorkspacePanel tabId={layout.secondary} mounted />
      </div>
    </div>
  );
}

export function DocumentEditorWorkspace() {
  const { dictionaryMode, showOntologyTab, content, catalogSanityHasIssues } = useDocumentEditorController();
  const { activeTab, splitLayout, setSplitLayout } = useDocumentEditorTab();
  const mountedTabs = useWorkspaceEagerMount(activeTab);
  const [dragOver, setDragOver] = useState<DropSide | null>(null);

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('application/x-editor-tab')) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const side: DropSide = e.clientX < rect.left + rect.width / 2 ? 'left' : 'right';
    setDragOver(side);
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOver(null);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const droppedTab = e.dataTransfer.getData('application/x-editor-tab') as EditorTabId;
    if (!droppedTab) return;

    const partner = activeTab === droppedTab
      ? (droppedTab === EDITOR_TAB_IDS.document ? EDITOR_TAB_IDS.dictionaries : EDITOR_TAB_IDS.document)
      : activeTab;

    if (partner === droppedTab) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const side: DropSide = e.clientX < rect.left + rect.width / 2 ? 'left' : 'right';

    if (side === 'left') {
      setSplitLayout(createSplitLayout(droppedTab, partner));
    } else {
      setSplitLayout(createSplitLayout(partner, droppedTab));
    }
  }, [activeTab, setSplitLayout]);

  const onRatioChange = useCallback((ratio: number) => {
    if (splitLayout.type !== 'split') return;
    setSplitLayout({ ...splitLayout, ratio });
  }, [setSplitLayout, splitLayout]);

  return (
    <div
      className="flex-1 min-h-0 min-w-0 w-full max-w-full overflow-hidden bg-[#0d0d0d] relative"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <SplitDropOverlay visible={dragOver != null} side={dragOver} />

      {splitLayout.type === 'split' ? (
        <SplitWorkspace
          layout={splitLayout}
          onRatioChange={onRatioChange}
        />
      ) : (
        <>
          <WorkspacePanel active={activeTab === EDITOR_TAB_IDS.document}>
            <EditorWorkspacePanel tabId={EDITOR_TAB_IDS.document} mounted />
          </WorkspacePanel>

          {dictionaryMode && (
            <WorkspacePanel active={activeTab === EDITOR_TAB_IDS.dictionaries}>
              <EditorWorkspacePanel
                tabId={EDITOR_TAB_IDS.dictionaries}
                mounted={mountedTabs.has(EDITOR_TAB_IDS.dictionaries)}
              />
            </WorkspacePanel>
          )}

          {showOntologyTab && (
            <WorkspacePanel active={activeTab === EDITOR_TAB_IDS.ontology}>
              <EditorWorkspacePanel
                tabId={EDITOR_TAB_IDS.ontology}
                mounted={mountedTabs.has(EDITOR_TAB_IDS.ontology)}
              />
            </WorkspacePanel>
          )}

          {showOntologyTab && (
            <WorkspacePanel active={activeTab === EDITOR_TAB_IDS.disambiguation}>
              <EditorWorkspacePanel
                tabId={EDITOR_TAB_IDS.disambiguation}
                mounted={mountedTabs.has(EDITOR_TAB_IDS.disambiguation)}
              />
            </WorkspacePanel>
          )}

          {showOntologyTab && (
            <WorkspacePanel active={activeTab === EDITOR_TAB_IDS.testPlan}>
              <EditorWorkspacePanel
                tabId={EDITOR_TAB_IDS.testPlan}
                mounted={mountedTabs.has(EDITOR_TAB_IDS.testPlan) || activeTab === EDITOR_TAB_IDS.testPlan}
              />
            </WorkspacePanel>
          )}

          {showOntologyTab && catalogSanityHasIssues && (
            <WorkspacePanel active={activeTab === EDITOR_TAB_IDS.report}>
              <EditorWorkspacePanel
                tabId={EDITOR_TAB_IDS.report}
                mounted={mountedTabs.has(EDITOR_TAB_IDS.report) || activeTab === EDITOR_TAB_IDS.report}
              />
            </WorkspacePanel>
          )}
        </>
      )}
    </div>
  );
}
