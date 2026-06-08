import React, { useCallback, useState } from 'react';
import { Upload, UploadCloud } from 'lucide-react';

interface UploadZoneProps {
  onFiles: (files: File[]) => void;
  uploading: boolean;
}

export function UploadZone({ onFiles, uploading }: UploadZoneProps) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length) onFiles(files);
    },
    [onFiles]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length) onFiles(files);
      e.target.value = '';
    },
    [onFiles]
  );

  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`
        flex flex-col items-center justify-center gap-2 mx-3 mt-3 mb-1 p-4 rounded
        border border-dashed cursor-pointer transition-all
        ${dragOver
          ? 'border-emerald-400/60 bg-emerald-400/5'
          : 'border-[#1a3a2a] hover:border-emerald-400/40 hover:bg-[#0a1510]'
        }
        ${uploading ? 'opacity-50 pointer-events-none' : ''}
      `}
    >
      <input type="file" multiple className="hidden" onChange={handleChange} disabled={uploading} />
      {uploading ? (
        <Upload className="w-5 h-5 text-emerald-400 animate-pulse" />
      ) : (
        <UploadCloud className="w-5 h-5 text-emerald-400/50" />
      )}
      <span className="font-mono text-xs text-emerald-400/40 text-center leading-relaxed">
        {uploading ? 'uploading…' : 'drop files or click'}
      </span>
    </label>
  );
}
