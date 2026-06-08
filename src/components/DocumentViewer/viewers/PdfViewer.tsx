import React, { useEffect, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';

interface PdfViewerProps {
  fileUrl: string;
}

export function PdfViewer({ fileUrl }: PdfViewerProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    setBlobUrl(null);
    setError(null);

    fetch(fileUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load PDF'));

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileUrl]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-red-400">
        <AlertCircle className="w-6 h-6" />
        <span className="font-mono text-sm">{error}</span>
      </div>
    );
  }

  if (!blobUrl) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-emerald-400/60">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="font-mono text-sm">Loading PDF…</span>
      </div>
    );
  }

  return (
    <iframe
      src={blobUrl}
      className="w-full h-full border-0"
      title="PDF"
    />
  );
}
