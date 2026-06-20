/**
 * Main navigation tabs — instant click switch; drag tab onto workspace to split side-by-side.
 */
import { AlertTriangle, BookOpen, FileText, Library, MessageSquare } from 'lucide-react';
import { useDocumentEditorController, useDocumentEditorTab } from './DocumentEditorContext';
import { EDITOR_TAB_DRAG_MIME } from './documentEditorSplitLayout';
import { EDITOR_TAB_IDS, type EditorTabId } from './editorTabIds';
import { catalogSanityIssueCount, hasCatalogSanityIssues } from '../../lib/catalogSanity';

const TABS: Array<{
  id: EditorTabId;
  label: string;
  icon: typeof FileText;
  dictionaryOnly?: boolean;
  /** Shown only when catalog sanity report has issues */
  reportTab?: boolean;
}> = [
  { id: EDITOR_TAB_IDS.document, label: 'Documento originale', icon: FileText },
  { id: EDITOR_TAB_IDS.dictionaries, label: 'Dizionari', icon: Library, dictionaryOnly: true },
  { id: EDITOR_TAB_IDS.ontology, label: 'Ontologia', icon: BookOpen, dictionaryOnly: true },
  { id: EDITOR_TAB_IDS.report, label: 'Report', icon: AlertTriangle, dictionaryOnly: true, reportTab: true },
  { id: EDITOR_TAB_IDS.disambiguation, label: 'Messaggi di disambiguazione', icon: MessageSquare, dictionaryOnly: true },
];

export function DocumentEditorTabStrip() {
  const { dictionaryMode, showOntologyTab, catalogSanityReport } = useDocumentEditorController();
  const { activeTab, setActiveTab, splitLayout } = useDocumentEditorTab();
  const showReportTab = showOntologyTab && hasCatalogSanityIssues(catalogSanityReport);
  const reportBadge = catalogSanityIssueCount(catalogSanityReport);

  const visible = TABS.filter((t) => {
    if (t.reportTab) return showReportTab;
    if (t.id === EDITOR_TAB_IDS.ontology || t.id === EDITOR_TAB_IDS.disambiguation) return showOntologyTab;
    if (t.dictionaryOnly) return dictionaryMode;
    return true;
  });

  return (
    <div className="flex items-end gap-0 min-h-[32px] px-1 flex-shrink-0 min-w-0 overflow-x-auto scrollbar-thin">
      {visible.map((t) => {
        const Icon = t.icon;
        const active = splitLayout.type === 'split'
          ? splitLayout.primary === t.id || splitLayout.secondary === t.id
          : activeTab === t.id;
        const isReport = t.id === EDITOR_TAB_IDS.report;

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
              flex items-center gap-1.5 px-3 py-1.5 font-mono text-sm border rounded-t transition-colors cursor-grab active:cursor-grabbing
              ${active
                ? isReport
                  ? 'bg-amber-400/15 border-amber-400/45 border-b-transparent text-amber-50'
                  : 'bg-[#0f3524] border-emerald-400/40 border-b-transparent text-emerald-50'
                : isReport
                  ? 'bg-amber-400/8 border-amber-400/25 text-amber-200/90 hover:bg-amber-400/12'
                  : 'bg-transparent border-transparent text-emerald-400/65 hover:bg-emerald-400/8 hover:text-emerald-300/90'
              }
            `}
            title="Clic per aprire · trascina nell'area sotto per affiancare"
          >
            <Icon className="w-3.5 h-3.5 flex-shrink-0" />
            {t.label}
            {t.reportTab && reportBadge > 0 && (
              <span className="ml-0.5 min-w-[1.1rem] px-1 py-px rounded-full bg-amber-400/25 border border-amber-400/40 text-[10px] text-amber-100/95 tabular-nums text-center">
                {reportBadge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
