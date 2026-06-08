import React, { useState } from 'react';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface ImageViewerProps {
  fileUrl: string;
  fileName: string;
}

export function ImageViewer({ fileUrl, fileName }: ImageViewerProps) {
  const [scale, setScale] = useState(1);

  const zoomIn = () => setScale((s) => Math.min(s + 0.25, 5));
  const zoomOut = () => setScale((s) => Math.max(s - 0.25, 0.25));
  const reset = () => setScale(1);

  return (
    <div className="flex flex-col min-h-0 flex-1 h-full">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#1a3a2a] bg-[#0a1510]">
        <button
          onClick={zoomOut}
          className="p-1 rounded hover:bg-[#1a3a2a] text-emerald-400/70 hover:text-emerald-400 transition-colors"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={zoomIn}
          className="p-1 rounded hover:bg-[#1a3a2a] text-emerald-400/70 hover:text-emerald-400 transition-colors"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={reset}
          className="p-1 rounded hover:bg-[#1a3a2a] text-emerald-400/70 hover:text-emerald-400 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        <span className="font-mono text-xs text-emerald-400/40 ml-1">{Math.round(scale * 100)}%</span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center p-4 bg-[#0d0d0d]">
        <img
          src={fileUrl}
          alt={fileName}
          style={{ transform: `scale(${scale})`, transformOrigin: 'center center', transition: 'transform 0.15s ease' }}
          className="max-w-none"
        />
      </div>
    </div>
  );
}
