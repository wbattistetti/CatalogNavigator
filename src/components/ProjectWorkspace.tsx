/**
 * Project workspace: document drop zone when empty, full editor when loaded.
 */
import { useCallback, useEffect, useState } from 'react';
import { FileUp, Loader2 } from 'lucide-react';
import { MainPanel } from './MainPanel';
import { UploadZone } from './UploadZone';
import { detectFileFormat, isTabularFormat } from '../lib/fileFormat';
import { extractColumnHeadersFromFile } from '../lib/parseTabular';
import type { KbDocument } from '../lib/supabase';
import type { ProjectCatalogRow } from '../types/project';
import {
  activateProject,
  fetchProjectDocument,
} from '../services/projectService';
import { supabase } from '../lib/supabase';

interface ProjectWorkspaceProps {
  project: ProjectCatalogRow;
  getFileUrl: (storagePath: string) => string;
}

export function ProjectWorkspace({ project, getFileUrl }: ProjectWorkspaceProps) {
  const [doc, setDoc] = useState<KbDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDocument = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const found = await fetchProjectDocument(project.id);
      setDoc(found);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Caricamento fallito');
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    void loadDocument();
  }, [loadDocument]);

  const handleDocUpdated = useCallback((updated: KbDocument) => {
    setDoc(updated);
  }, []);

  const handleUpload = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const format = detectFileFormat(file);
      let columnHeaders: string[] = [];
      if (isTabularFormat(format)) {
        columnHeaders = await extractColumnHeadersFromFile(file, format);
      }

      const storagePath = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error: uploadErr } = await supabase.storage
        .from('kb-documents')
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (uploadErr) throw new Error(uploadErr.message);

      const { data, error: insertErr } = await supabase
        .from('kb_documents')
        .insert({
          name: file.name,
          format,
          storage_path: storagePath,
          file_size: file.size,
          column_headers: columnHeaders,
          project_id: project.id,
        })
        .select()
        .single();
      if (insertErr || !data) throw new Error(insertErr?.message ?? 'Documento non creato');

      await activateProject(project.id);
      setDoc(data as KbDocument);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload fallito');
    } finally {
      setUploading(false);
    }
  }, [project.id]);

  const fileUrl = doc ? getFileUrl(doc.storage_path) : null;

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden">
      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-emerald-400/30 font-mono text-sm">
          <Loader2 className="w-5 h-5 animate-spin" />
          Caricamento…
        </div>
      ) : doc && fileUrl ? (
        <MainPanel
          key={doc.id}
          doc={doc}
          fileUrl={fileUrl}
          onDocUpdated={handleDocUpdated}
        />
      ) : (
        <div className="flex flex-col flex-1 items-center justify-center gap-6 px-6">
          <div className="text-center max-w-md">
            <FileUp className="w-12 h-12 text-emerald-400/25 mx-auto mb-4" />
            <h2 className="font-mono text-lg text-[#e8d48b] mb-2">Documento originale</h2>
            <p className="font-mono text-sm text-emerald-400/40 leading-relaxed">
              Carica il file sorgente del progetto. Da qui potrai lavorare su dizionari, ontologia e agent come prima.
            </p>
          </div>
          <div className="w-full max-w-lg">
            <UploadZone
              onFiles={(files) => void handleUpload(files)}
              uploading={uploading}
              variant="large"
              multiple={false}
            />
          </div>
          {error && (
            <p className="font-mono text-xs text-red-400">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
