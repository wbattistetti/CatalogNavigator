/**
 * Main navigation tabs — instant click switch; drag tab onto workspace to split side-by-side.
 */
import { BookOpen, FileText, Library, Sparkles } from 'lucide-react';
import { useDocumentEditorController, useDocumentEditorTab } from './DocumentEditorContext';
import { EDITOR_TAB_DRAG_MIME } from './documentEditorSplitLayout';
import { EDITOR_TAB_IDS, type EditorTabId } from './editorTabIds';

const TABS: Array<{
  id: EditorTabId;
  label: string;
  icon: typeof FileText;
  dictionaryOnly?: boolean;
}> = [
  { id: EDITOR_TAB_IDS.document, label: 'Documento originale', icon: FileText },
  { id: EDITOR_TAB_IDS.dictionaries, label: 'Dizionari', icon: Library, dictionaryOnly: true },
  { id: EDITOR_TAB_IDS.ontology, label: 'Ontologia', icon: BookOpen, dictionaryOnly: true },
  { id: EDITOR_TAB_IDS.agent, label: 'Agente Virtuale', icon: Sparkles },
];

export function DocumentEditorTabStrip() {
  const { dictionaryMode } = useDocumentEditorController();
  const { activeTab, setActiveTab, splitLayout } = useDocumentEditorTab();
  const visible = TABS.filter((t) => !t.dictionaryOnly || dictionaryMode);

  return (
    <div className="flex items-end gap-0 min-h-[32px] px-1">
      {visible.map((t) => {
        const Icon = t.icon;
        const active = splitLayout.type === 'split'
          ? splitLayout.primary === t.id || splitLayout.secondary === t.id
          : activeTab === t.id;

        return (
          <button
            key={t.id}
            type="button"
            draggable
            onClick={() => setActiveTab(t.id)}
            onDragStart={(e) => {
              e.dataTransfer.setData(EDITOR_TAB_DRAG_MIME, t.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 font-mono text-xs border rounded-t transition-colors cursor-grab active:cursor-grabbing
              ${active
                ? 'bg-[#0f3524] border-emerald-400/40 border-b-transparent text-emerald-50'
                : 'bg-transparent border-transparent text-emerald-400/65 hover:bg-emerald-400/8 hover:text-emerald-300/90'
              }
            `}
            title="Clic per aprire · trascina nell'area sotto per affiancare"
          >
            <Icon className="w-3.5 h-3.5 flex-shrink-0" />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
