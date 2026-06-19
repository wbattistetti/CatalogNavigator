import React, { useCallback, useState } from 'react';
import { Upload, UploadCloud } from 'lucide-react';

interface UploadZoneProps {
  onFiles: (files: File[]) => void;
  uploading: boolean;
  variant?: 'compact' | 'large';
  multiple?: boolean;
}

export function UploadZone({
  onFiles,
  uploading,
  variant = 'compact',
  multiple = true,
}: UploadZoneProps) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length) onFiles(multiple ? files : files.slice(0, 1));
    },
    [onFiles, multiple]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length) onFiles(multiple ? files : files.slice(0, 1));
      e.target.value = '';
    },
    [onFiles, multiple]
  );

  const isLarge = variant === 'large';

  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`
        flex flex-col items-center justify-center gap-3 rounded cursor-pointer transition-all border border-dashed
        ${isLarge ? 'p-12' : 'gap-2 mx-3 mt-3 mb-1 p-4'}
        ${dragOver
          ? 'border-emerald-400/60 bg-emerald-400/5'
          : 'border-[#1a3a2a] hover:border-emerald-400/40 hover:bg-[#0a1510]'
        }
        ${uploading ? 'opacity-50 pointer-events-none' : ''}
      `}
    >
      <input
        type="file"
        multiple={multiple}
        className="hidden"
        onChange={handleChange}
        disabled={uploading}
      />
      {uploading ? (
        <Upload className={`${isLarge ? 'w-10 h-10' : 'w-5 h-5'} text-emerald-400 animate-pulse`} />
      ) : (
        <UploadCloud className={`${isLarge ? 'w-10 h-10' : 'w-5 h-5'} text-emerald-400/50`} />
      )}
      <span className={`font-mono text-center leading-relaxed ${isLarge ? 'text-sm text-emerald-400/50' : 'text-xs text-emerald-400/40'}`}>
        {uploading
          ? 'Caricamento in corso…'
          : isLarge
            ? 'Trascina il documento qui o clicca per selezionarlo'
            : 'drop files or click'}
      </span>
    </label>
  );
}
