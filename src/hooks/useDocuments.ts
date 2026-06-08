import { useState, useEffect, useCallback } from 'react';
import { supabase, type KbDocument } from '../lib/supabase';

export function useDocuments() {
  const [documents, setDocuments] = useState<KbDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('kb_documents')
      .select('*')
      .order('created_at', { ascending: false });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setDocuments(data ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const uploadDocument = useCallback(async (file: File, format: string, columnHeaders: string[]): Promise<KbDocument | null> => {
    const storagePath = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    const { error: uploadErr } = await supabase.storage
      .from('kb-documents')
      .upload(storagePath, file, { contentType: file.type, upsert: false });

    if (uploadErr) { setError(uploadErr.message); return null; }

    const { data, error: insertErr } = await supabase
      .from('kb_documents')
      .insert({
        name: file.name,
        format,
        storage_path: storagePath,
        file_size: file.size,
        column_headers: columnHeaders,
      })
      .select()
      .single();

    if (insertErr) { setError(insertErr.message); return null; }
    setDocuments((prev) => [data, ...prev]);
    return data;
  }, []);

  const deleteDocument = useCallback(async (doc: KbDocument) => {
    await supabase.storage.from('kb-documents').remove([doc.storage_path]);
    await supabase.from('kb_documents').delete().eq('id', doc.id);
    setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
  }, []);

  const getFileUrl = useCallback((storagePath: string): string => {
    const { data } = supabase.storage.from('kb-documents').getPublicUrl(storagePath);
    return data.publicUrl;
  }, []);

  const refreshDocument = useCallback(async (id: string): Promise<KbDocument | null> => {
    const { data, error: err } = await supabase
      .from('kb_documents')
      .select('*')
      .eq('id', id)
      .single();
    if (err || !data) return null;
    setDocuments((prev) => prev.map((d) => (d.id === id ? data : d)));
    return data as KbDocument;
  }, []);

  const upsertDocument = useCallback((doc: KbDocument) => {
    setDocuments((prev) => prev.map((d) => (d.id === doc.id ? doc : d)));
  }, []);

  return {
    documents, loading, error, uploadDocument, deleteDocument, getFileUrl,
    reload: load, refreshDocument, upsertDocument,
  };
}
