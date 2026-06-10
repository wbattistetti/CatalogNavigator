/**
 * Main navigation tabs (click only — no outer dock split).
 */
import { BookOpen, FileText, Library, Sparkles } from 'lucide-react';
import { useDocumentEditor } from './DocumentEditorContext';
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
  const { dictionaryMode, activeTab, setActiveTab } = useDocumentEditor();
  const visible = TABS.filter((t) => !t.dictionaryOnly || dictionaryMode);

  return (
    <div className="flex items-center gap-0">
      {visible.map((t) => {
        const Icon = t.icon;
        const active = activeTab === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`
              flex items-center gap-1.5 px-3 py-2 font-mono text-xs border-b-2 transition-colors
              ${active
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-emerald-400/40 hover:text-emerald-400/70'
              }
            `}
          >
            <Icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
