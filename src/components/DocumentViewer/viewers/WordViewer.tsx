import React, { useEffect, useState } from 'react';
import mammoth from 'mammoth';
import { Loader2, AlertCircle } from 'lucide-react';

interface WordViewerProps {
  fileUrl: string;
}

export function WordViewer({ fileUrl }: WordViewerProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const ab = await res.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer: ab });
        if (!cancelled) setHtml(result.value);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Conversion failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [fileUrl]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-emerald-400/60">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="font-mono text-sm">Converting document…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-red-400">
        <AlertCircle className="w-5 h-5" />
        <span className="font-mono text-sm">{error}</span>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto p-6">
      <div
        className="word-content max-w-3xl mx-auto"
        dangerouslySetInnerHTML={{ __html: html ?? '' }}
      />
    </div>
  );
}
