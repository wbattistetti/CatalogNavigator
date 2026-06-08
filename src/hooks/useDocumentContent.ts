/**
 * Loads document text and tabular data once per file — shared by reader and dictionary.
 */
import { useEffect, useState } from 'react';
import { isTabularFormat, supportsDictionaryFormat } from '../lib/fileFormat';
import { parseTabularText, parseTextForDictionary, xlsxToTabular } from '../lib/parseTabular';
import type { ParsedTabular } from '../lib/parseTabular';
import type { KbDocument } from '../lib/supabase';

// @ts-ignore — Vite bundles the worker for pdfjs fallback
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';

export interface DocumentContent {
  /** Plain text for analysis / edge functions. */
  text: string | null;
  /** Parsed table for dictionary workflow. */
  tabular: ParsedTabular | null;
  /** Raw text when the file is not tabular (for TextViewer). */
  textContent: string | null;
  loading: boolean;
  error: string | null;
}

const IDLE: DocumentContent = {
  text: null,
  tabular: null,
  textContent: null,
  loading: false,
  error: null,
};

async function extractPdfText(ab: ArrayBuffer): Promise<string> {
  const workerMod = await import('pdfjs-dist/build/pdf.worker.min.js');
  (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = (workerMod as { default?: unknown }).default ?? workerMod;

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

/** Fetches and parses document content; survives tab switches. */
export function useDocumentContent(doc: KbDocument, fileUrl: string): DocumentContent {
  const [content, setContent] = useState<DocumentContent>(IDLE);

  useEffect(() => {
    let cancelled = false;

    if (doc.format === 'pdf' || doc.format === 'docx') {
      setContent({ ...IDLE, loading: false });
      (async () => {
        try {
          const res = await fetch(fileUrl);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const ab = await res.arrayBuffer();
          const text = doc.format === 'pdf' ? await extractPdfText(ab) : await extractDocxText(ab);
          if (!cancelled) setContent((prev) => ({ ...prev, text }));
        } catch {
          // Non-fatal — viewer still works without extracted text.
        }
      })();
      return () => { cancelled = true; };
    }

    if (doc.format === 'image') {
      setContent(IDLE);
      return;
    }

    setContent({ ...IDLE, loading: true });

    (async () => {
      try {
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        if (doc.format === 'xlsx') {
          const blob = await res.blob();
          const file = new File([blob], doc.name, { type: blob.type });
          const { tabular } = await xlsxToTabular(file);
          const serialized = [tabular.headers.join('\t'), ...tabular.rows.map((r) => r.join('\t'))].join('\n');
          if (!cancelled) {
            setContent({
              text: serialized,
              tabular,
              textContent: null,
              loading: false,
              error: null,
            });
          }
          return;
        }

        const text = await res.text();
        if (cancelled) return;

        if (isTabularFormat(doc.format)) {
          const parsed = parseTabularText(text);
          setContent({
            text,
            tabular: parsed,
            textContent: parsed ? null : text,
            loading: false,
            error: null,
          });
          return;
        }

        if (supportsDictionaryFormat(doc.format)) {
          const parsed = parseTextForDictionary(text);
          setContent({
            text,
            tabular: parsed,
            textContent: parsed ? null : text,
            loading: false,
            error: null,
          });
          return;
        }

        setContent({
          text,
          tabular: null,
          textContent: text,
          loading: false,
          error: null,
        });
      } catch (e) {
        if (!cancelled) {
          setContent({
            ...IDLE,
            error: e instanceof Error ? e.message : 'Failed to load',
          });
        }
      }
    })();

    return () => { cancelled = true; };
  }, [doc.id, fileUrl, doc.format, doc.name]);

  return content;
}
