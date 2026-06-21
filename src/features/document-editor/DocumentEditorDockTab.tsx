/**
 * Draggable tab chrome for main document editor dock panels.
 */
import { AlertTriangle, BookOpen, FileText, Library, MessageSquare, TestTube2 } from 'lucide-react';
import type { IDockviewPanelHeaderProps } from 'dockview';
import { EDITOR_TAB_IDS, type EditorTabId } from './editorTabIds';

const TAB_META: Record<
  EditorTabId,
  { label: string; icon: typeof FileText }
> = {
  [EDITOR_TAB_IDS.document]: { label: 'Documento originale', icon: FileText },
  [EDITOR_TAB_IDS.dictionaries]: { label: 'Dizionari', icon: Library },
  [EDITOR_TAB_IDS.ontology]: { label: 'Ontologia', icon: BookOpen },
  [EDITOR_TAB_IDS.disambiguation]: { label: 'Messaggi di disambiguazione', icon: MessageSquare },
  [EDITOR_TAB_IDS.report]: { label: 'Report', icon: AlertTriangle },
  [EDITOR_TAB_IDS.testPlan]: { label: 'Test Plan', icon: TestTube2 },
};

function isEditorTabId(id: string): id is EditorTabId {
  return id in TAB_META;
}

export function DocumentEditorDockTab(props: IDockviewPanelHeaderProps) {
  const meta = isEditorTabId(props.api.id) ? TAB_META[props.api.id] : null;
  const Icon = meta?.icon ?? FileText;
  const active = props.api.isActive;

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 font-mono text-sm min-w-0 h-full ${
        active ? 'text-emerald-50' : 'text-emerald-400/65'
      }`}
    >
      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="truncate">{meta?.label ?? props.api.title}</span>
    </div>
  );
}
