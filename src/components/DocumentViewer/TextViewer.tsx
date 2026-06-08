import React from 'react';
import type { KbFileFormat } from '../../lib/supabase';

interface TextViewerProps {
  text: string;
  format: KbFileFormat;
}

export function TextViewer({ text, format }: TextViewerProps) {
  const displayText =
    format === 'json'
      ? (() => {
          try {
            return JSON.stringify(JSON.parse(text), null, 2);
          } catch {
            return text;
          }
        })()
      : text;

  return (
    <div className="flex-1 min-h-0 overflow-auto p-4">
      <pre className="font-mono text-xs leading-relaxed text-emerald-300/80 whitespace-pre-wrap break-words">
        {displayText}
      </pre>
    </div>
  );
}
