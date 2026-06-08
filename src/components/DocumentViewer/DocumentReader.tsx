import React, { useEffect, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { PdfViewer } from './viewers/PdfViewer';
import { WordViewer } from './viewers/WordViewer';
import { ImageViewer } from './viewers/ImageViewer';
import { TabularPreview } from './TabularPreview';
import { TextViewer } from './TextViewer';
import { isTabularFormat } from '../../lib/fileFormat';
import { parseTabularText, xlsxToTabular } from '../../lib/parseTabular';
import type { KbDocument } from '../../lib/supabase';
import type { ParsedTabular } from '../../lib/parseTabular';

// Static URL import so Vite bundles the worker as an asset for fallback
// @ts-ignore
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';

interface DocumentReaderProps {
  doc: KbDocument;
  fileUrl: string;
  onTextReady?: (text: string) => void;
}

async function extractPdfText(ab: ArrayBuffer): Promise<string> {
  // Pre-populate globalThis.pdfjsWorker so pdfjs fake-worker mode works in
  // sandboxed environments (Bolt iframes) where new Worker(url) is unavailable.
  const workerMod = await import('pdfjs-dist/build/pdf.worker.min.js');
  (globalThis as any).pdfjsWorker = (workerMod as any).default ?? workerMod;

  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(ab) }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .filter((item): item is { str: string } => 'str' in item)
      .map((item) => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) pages.push(text);
  }

  return pages.join('\n\n');
}

async function extractDocxText(ab: ArrayBuffer): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.default.extractRawText({ arrayBuffer: ab });
  return result.value;
}

export function DocumentReader({ doc, fileUrl, onTextReady }: DocumentReaderProps) {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [tabular, setTabular] = useState<ParsedTabular | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setTextContent(null);
    setTabular(null);

    // PDF and DOCX: extract text silently in background; display handled by their own components
    if (doc.format === 'pdf' || doc.format === 'docx') {
      (async () => {
        try {
          const res = await fetch(fileUrl);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const ab = await res.arrayBuffer();
          const text = doc.format === 'pdf'
            ? await extractPdfText(ab)
            : await extractDocxText(ab);
          if (!cancelled) onTextReady?.(text);
        } catch {
          // Text extraction failure is non-fatal — display still works
        }
      })();
      return () => { cancelled = true; };
    }

    // Images: no text to extract
    if (doc.format === 'image') return;

    // Text / tabular formats: extract and display
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        if (doc.format === 'xlsx') {
          const blob = await res.blob();
          const file = new File([blob], doc.name, { type: blob.type });
          const { tabular: t } = await xlsxToTabular(file);
          if (!cancelled) {
            setTabular(t);
            const serialized = [t.headers.join('\t'), ...t.rows.map((r) => r.join('\t'))].join('\n');
            onTextReady?.(serialized);
          }
        } else {
          const text = await res.text();
          if (!cancelled) {
            if (isTabularFormat(doc.format)) {
              const parsed = parseTabularText(text);
              setTabular(parsed);
              if (!parsed) setTextContent(text);
            } else {
              setTextContent(text);
            }
            onTextReady?.(text);
          }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [doc.id, fileUrl, doc.format, doc.name]);

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
  if (tabular) return <TabularPreview tabular={tabular} docId={doc.id} initialRoles={doc.column_roles ?? {}} />;
  if (textContent !== null) return <TextViewer text={textContent} format={doc.format} />;

  return null;
}
