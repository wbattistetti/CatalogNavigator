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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-emerald-400/60">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="font-mono text-sm">Loading…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-red-400">
        <AlertCircle className="w-6 h-6" />
        <span className="font-mono text-sm">{error}</span>
      </div>
    );
  }

  if (doc.format === 'pdf') return <PdfViewer fileUrl={fileUrl} />;
  if (doc.format === 'docx') return <WordViewer fileUrl={fileUrl} />;
  if (doc.format === 'image') return <ImageViewer fileUrl={fileUrl} fileName={doc.name} />;
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
  if (textContent !== null) return <TextViewer text={textContent} format={doc.format} />;

  return null;
}
