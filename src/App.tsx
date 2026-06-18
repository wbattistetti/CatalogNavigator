import React, { useState, useCallback } from 'react';
import { Database, AlertCircle } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { MainPanel } from './components/MainPanel';
import { UploadZone } from './components/UploadZone';
import { useDocuments } from './hooks/useDocuments';
import { detectFileFormat, isTabularFormat } from './lib/fileFormat';
import { extractColumnHeadersFromFile } from './lib/parseTabular';
import type { KbDocument } from './lib/supabase';

export default function App() {
  const {
    documents, loading, error, uploadDocument, deleteDocument, getFileUrl,
    refreshDocument, upsertDocument,
  } = useDocuments();
  const [selectedDoc, setSelectedDoc] = useState<KbDocument | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFiles = useCallback(
    async (files: File[]) => {
      setUploading(true);
      setUploadError(null);
      let firstUploaded: KbDocument | null = null;

      for (const file of files) {
        const format = detectFileFormat(file);
        let columnHeaders: string[] = [];

        if (isTabularFormat(format)) {
          try {
            columnHeaders = await extractColumnHeadersFromFile(file, format);
          } catch (err) {
            setUploadError(err instanceof Error ? err.message : 'Impossibile leggere le colonne');
          }
        }

        const doc = await uploadDocument(file, format, columnHeaders);
        if (!doc) { setUploadError('Upload failed'); continue; }
        if (!firstUploaded) firstUploaded = doc;
      }

      if (firstUploaded) setSelectedDoc(firstUploaded);
      setUploading(false);
    },
    [uploadDocument]
  );

  const handleDelete = useCallback(
    async (doc: KbDocument) => {
      await deleteDocument(doc);
      setSelectedDoc((prev) => (prev?.id === doc.id ? null : prev));
    },
    [deleteDocument]
  );

  const handleSelectDoc = useCallback(
    async (doc: KbDocument) => {
      const fresh = await refreshDocument(doc.id);
      setSelectedDoc(fresh ?? doc);
    },
    [refreshDocument],
  );

  const handleDocUpdated = useCallback(
    (updated: KbDocument) => {
      setSelectedDoc(updated);
      upsertDocument(updated);
    },
    [upsertDocument],
  );

  const fileUrl = selectedDoc ? getFileUrl(selectedDoc.storage_path) : null;

  return (
    <div className="flex flex-col h-screen w-full max-w-full overflow-hidden bg-[#0d0d0d] text-emerald-300">
      {/* Top bar */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center gap-2 px-4 py-2 bg-[#050a06] border-b border-[#1a3a2a] h-10">
        <Database className="w-4 h-4 text-emerald-400" />
        <span className="font-mono text-xs font-semibold text-emerald-400/80 tracking-widest uppercase">
          Omnia — Knowledge Base
        </span>
        {(error || uploadError) && (
          <div className="flex items-center gap-1.5 ml-4 text-red-400 font-mono text-xs">
            <AlertCircle className="w-3.5 h-3.5" />
            {error ?? uploadError}
          </div>
        )}
      </div>

      {/* Layout below top bar */}
      <div className="flex flex-1 min-h-0 min-w-0 w-full max-w-full overflow-hidden mt-10">
        <Sidebar
          documents={documents}
          loading={loading}
          selectedId={selectedDoc?.id ?? null}
          onSelect={handleSelectDoc}
          onDelete={handleDelete}
        >
          <UploadZone onFiles={handleFiles} uploading={uploading} />
        </Sidebar>

        <main className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
          {selectedDoc && fileUrl ? (
            <MainPanel
              key={selectedDoc.id}
              doc={selectedDoc}
              fileUrl={fileUrl}
              onDocUpdated={handleDocUpdated}
            />
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 gap-4 text-emerald-400/20">
              <Database className="w-12 h-12" />
              <p className="font-mono text-sm">Select a document to preview</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
