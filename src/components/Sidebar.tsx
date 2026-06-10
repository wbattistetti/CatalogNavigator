import React from 'react';
import {
  FileText, FileSpreadsheet, File, Image, FileCode, FileJson, BookOpen, Trash2, Loader2,
} from 'lucide-react';
import type { KbDocument, KbFileFormat } from '../lib/supabase';
import { formatLabel, formatColor } from '../lib/fileFormat';

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

interface SidebarProps {
  documents: KbDocument[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (doc: KbDocument) => void;
  onDelete: (doc: KbDocument) => void;
  children?: React.ReactNode;
}

export function Sidebar({ documents, loading, selectedId, onSelect, onDelete, children }: SidebarProps) {
  return (
    <div className="flex flex-col w-72 flex-shrink-0 min-h-0 border-r border-[#1a3a2a] bg-[#080e0a]">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1a3a2a]">
        <span className="font-mono text-xs font-semibold text-emerald-400/60 uppercase tracking-widest">
          Knowledge Base
        </span>
      </div>

      {children}

      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-8 gap-2 text-emerald-400/40">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="font-mono text-xs">loading…</span>
          </div>
        )}
        {!loading && documents.length === 0 && (
          <div className="px-4 py-6 text-center font-mono text-xs text-emerald-400/30 leading-relaxed">
            No documents yet.<br />Upload a file to get started.
          </div>
        )}
        {documents.map((doc) => {
          const isSelected = doc.id === selectedId;
          return (
            <div
              key={doc.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(doc)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(doc);
                }
              }}
              className={`
                group w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors cursor-pointer
                border-b border-[#111]
                ${isSelected
                  ? 'bg-[#0a1e10] border-l-2 border-l-emerald-400'
                  : 'hover:bg-[#0a1510] border-l-2 border-l-transparent'
                }
              `}
            >
              <span className={formatColor(doc.format).split(' ')[0] + ' mt-0.5'}>
                <FormatIcon format={doc.format} />
              </span>
              <div className="flex-1 min-w-0">
                <p className={`font-mono text-xs truncate leading-tight ${isSelected ? 'text-emerald-300' : 'text-emerald-400/70 group-hover:text-emerald-300'}`}>
                  {doc.name}
                </p>
                <span className={`inline-block mt-1 text-[10px] font-mono px-1.5 py-0.5 rounded border ${formatColor(doc.format)}`}>
                  {formatLabel(doc.format)}
                </span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(doc); }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-400/10 text-red-400/50 hover:text-red-400 transition-all flex-shrink-0 mt-0.5"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
