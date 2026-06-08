import React, { useCallback, useState } from 'react';
import {
  FileText, FileSpreadsheet, File, Image, FileCode, FileJson, BookOpen, Sparkles,
} from 'lucide-react';
import type { KbDocument, KbFileFormat } from '../lib/supabase';
import { formatLabel, formatColor } from '../lib/fileFormat';
import { DocumentReader } from './DocumentViewer/DocumentReader';
import { AnalysisView } from './DocumentViewer/AnalysisView';

function FormatIcon({ format, className = '' }: { format: KbFileFormat; className?: string }) {
  const props = { className: `w-4 h-4 flex-shrink-0 ${className}` };
  switch (format) {
    case 'pdf': return <File {...props} />;
    case 'docx': return <FileText {...props} />;
    case 'xlsx': case 'csv': return <FileSpreadsheet {...props} />;
    case 'json': return <FileJson {...props} />;
    case 'md': return <BookOpen {...props} />;
    case 'image': return <Image {...props} />;
    default: return <FileCode {...props} />;
  }
}

type TabId = 'document' | 'analysis';

interface MainPanelProps {
  doc: KbDocument;
  fileUrl: string;
}

export function MainPanel({ doc, fileUrl }: MainPanelProps) {
  const [tab, setTab] = useState<TabId>('document');
  const [documentText, setDocumentText] = useState<string | null>(null);
  const [analysisExists, setAnalysisExists] = useState(false);
  const [generateTrigger, setGenerateTrigger] = useState(0);

  const handleTextReady = useCallback((text: string) => {
    setDocumentText(text);
  }, []);

  const handleHasData = useCallback((v: boolean) => {
    setAnalysisExists(v);
  }, []);

  const handleGeneraTassonomia = () => {
    setGenerateTrigger((n) => n + 1);
    setTab('analysis');
  };

  // Enable button immediately for files with known column headers (FieldSelector
  // doesn't need the parsed text — only the final generate call does)
  const canInitiate = !!documentText || (!!doc.column_headers && doc.column_headers.length > 0);

  const visibleTabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'document', label: 'Documento', icon: <FileText className="w-3.5 h-3.5" /> },
    ...(analysisExists
      ? [{ id: 'analysis' as TabId, label: 'Documento riformattato', icon: <Sparkles className="w-3.5 h-3.5" /> }]
      : []),
  ];

  const tabLabel: Record<TabId, string> = {
    document: 'READER',
    analysis: 'SLOT FILLING',
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-[#1a3a2a] bg-[#080e0a]">
        <div className="flex items-center gap-2 mb-2">
          <span className={formatColor(doc.format).split(' ')[0]}>
            <FormatIcon format={doc.format} />
          </span>
          <h2 className="font-mono text-sm text-emerald-200 truncate flex-1 min-w-0">{doc.name}</h2>
          <span className={`flex-shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded border ${formatColor(doc.format)}`}>
            {formatLabel(doc.format)}
          </span>
        </div>
        {doc.column_headers && doc.column_headers.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            {doc.column_headers.map((col) => (
              <span
                key={col}
                className="flex-shrink-0 font-mono text-[10px] px-2 py-0.5 rounded-full bg-[#0a2a18] border border-emerald-400/20 text-emerald-400/70"
              >
                {col}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 border-b border-[#1a3a2a] bg-[#080e0a]">
        <div className="flex items-center gap-0">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`
                flex items-center gap-1.5 px-3 py-2 font-mono text-xs border-b-2 transition-colors
                ${tab === t.id
                  ? 'border-emerald-400 text-emerald-300'
                  : 'border-transparent text-emerald-400/40 hover:text-emerald-400/70'
                }
              `}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
        <button
            onClick={handleGeneraTassonomia}
            disabled={!canInitiate}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 font-mono text-xs font-semibold text-emerald-900 bg-emerald-400 rounded hover:bg-emerald-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Sparkles className="w-3 h-3" />
            {analysisExists ? 'Rigenera tassonomia' : 'Genera tassonomia'}
          </button>
      </div>

      {/* Tab label */}
      <div className="flex-shrink-0 px-4 py-1 bg-[#0a0a0a] border-b border-[#111]">
        <span className="font-mono text-[10px] text-emerald-400/30 uppercase tracking-widest">
          {tabLabel[tab]}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden bg-[#0d0d0d] relative">
        <div className={tab === 'document' ? 'absolute inset-0 flex flex-col' : 'hidden'}>
          <DocumentReader key={doc.id} doc={doc} fileUrl={fileUrl} onTextReady={handleTextReady} />
        </div>
        <div className={tab === 'analysis' ? 'absolute inset-0 flex flex-col' : 'hidden'}>
          <AnalysisView
            doc={doc}
            documentText={documentText}
            onHasData={handleHasData}
            generateTrigger={generateTrigger}
          />
        </div>
      </div>
    </div>
  );
}
