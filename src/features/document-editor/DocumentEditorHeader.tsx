/**
 * Document metadata header (filename, format, column chips).
 */
import {
  FileText, FileSpreadsheet, File, Image, FileCode, FileJson, BookOpen,
} from 'lucide-react';
import type { KbFileFormat } from '../../lib/supabase';
import { formatLabel, formatColor } from '../../lib/fileFormat';
import { useDocumentEditor } from './DocumentEditorContext';

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

export function DocumentEditorHeader() {
  const { doc, content } = useDocumentEditor();

  return (
    <div className="flex-shrink-0 px-4 py-3 border-b border-[#1a3a2a] bg-[#080e0a]">
      <div className="flex items-center gap-2 mb-2">
        <span className={formatColor(doc.format).split(' ')[0]}>
          <FormatIcon format={doc.format} />
        </span>
        <h2 className="font-mono text-sm text-emerald-200 truncate flex-1 min-w-0">{doc.name}</h2>
        {content.tabular && (
          <span className="flex-shrink-0 font-mono text-sm text-emerald-400/50 tabular-nums">
            {content.tabular.rows.length} righe
          </span>
        )}
        <span className={`flex-shrink-0 text-sm font-mono px-1.5 py-0.5 rounded border ${formatColor(doc.format)}`}>
          {formatLabel(doc.format)}
        </span>
      </div>
      {doc.column_headers && doc.column_headers.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
          {doc.column_headers.map((col) => (
            <span
              key={col}
              className="flex-shrink-0 font-mono text-sm px-2 py-0.5 rounded-full bg-[#0a2a18] border border-emerald-400/20 text-emerald-400/70"
            >
              {col}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
