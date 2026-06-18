import React from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { PdfViewer } from './viewers/PdfViewer';
import { WordViewer } from './viewers/WordViewer';
import { ImageViewer } from './viewers/ImageViewer';
import { TabularPreview } from './TabularPreview';
import { TextViewer } from './TextViewer';
import type { KbDocument } from '../../lib/supabase';
import type { DocumentContent } from '../../hooks/useDocumentContent';

interface DocumentReaderProps {
  doc: KbDocument;
  fileUrl: string;
  content: DocumentContent;
  onDocUpdated?: (doc: KbDocument) => void;
}

export function DocumentReader({ doc, fileUrl, content, onDocUpdated }: DocumentReaderProps) {
  const { tabular, textContent, loading, error } = content;
  const viewportClass = 'flex flex-1 min-h-0 min-w-0 overflow-hidden';
  const columnShellClass = `${viewportClass} flex-col`;
  const centeredClass = `${viewportClass} items-center justify-center gap-2`;

  if (loading) {
    return (
      <div className={`${centeredClass} text-emerald-400/60`}>
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="font-mono text-sm">Loading…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${centeredClass} text-red-400`}>
        <AlertCircle className="w-6 h-6" />
        <span className="font-mono text-sm">{error}</span>
      </div>
    );
  }

  if (doc.format === 'pdf') {
    return (
      <div className={columnShellClass}>
        <PdfViewer fileUrl={fileUrl} />
      </div>
    );
  }
  if (doc.format === 'docx') {
    return (
      <div className={columnShellClass}>
        <WordViewer fileUrl={fileUrl} />
      </div>
    );
  }
  if (doc.format === 'image') {
    return (
      <div className={columnShellClass}>
        <ImageViewer fileUrl={fileUrl} fileName={doc.name} />
      </div>
    );
  }
  if (tabular) {
    return (
      <TabularPreview
        tabular={tabular}
        docId={doc.id}
        initialRoles={doc.column_roles ?? {}}
        onDocUpdated={onDocUpdated}
      />
    );
  }
  if (textContent !== null) {
    return (
      <div className={columnShellClass}>
        <TextViewer text={textContent} format={doc.format} />
      </div>
    );
  }

  return null;
}
