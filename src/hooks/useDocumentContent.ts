/**
 * Loads document text and tabular data once per file — shared by reader and dictionary.
 */
import { useCallback, useEffect, useState } from 'react';
import { supportsDictionaryFormat } from '../lib/fileFormat';
import {
  detectSeparator,
  loadTabularFromBuffer,
  parseTextForDictionary,
  serializeTabular,
} from '../lib/parseTabular';
import type { ParsedTabular } from '../lib/parseTabular';
import type { KbDocument } from '../lib/supabase';

// @ts-ignore — Vite bundles the worker for pdfjs fallback
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';

export interface DocumentContent {
  /** Plain text for analysis / edge functions. */
  text: string | null;
  /** Parsed table for dictionary workflow. */
  tabular: ParsedTabular | null;
  /** CSV/TSV separator detected at load (for round-trip saves). */
  csvSeparator: '\t' | ';' | ',' | null;
  /** Raw text when the file is not tabular (for TextViewer). */
  textContent: string | null;
  loading: boolean;
  error: string | null;
  /** Replaces in-memory tabular data after row edits without re-fetching storage. */
  updateTabular: (tabular: ParsedTabular) => void;
}

const IDLE: DocumentContent = {
  text: null,
  tabular: null,
  csvSeparator: null,
  textContent: null,
  loading: false,
  error: null,
  updateTabular: () => {},
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

function loadTabularContent(
  ab: ArrayBuffer,
  doc: KbDocument,
  csvSeparator: '\t' | ';' | ',' | null = null,
): DocumentContent {
  const tabular = loadTabularFromBuffer(ab, doc.name, doc.format);
  return {
    text: serializeTabular(tabular),
    tabular,
    csvSeparator,
    textContent: null,
    loading: false,
    error: null,
    updateTabular: () => {},
  };
}

/** Fetches and parses document content; survives tab switches. */
export function useDocumentContent(doc: KbDocument, fileUrl: string): DocumentContent {
  const [content, setContent] = useState<DocumentContent>(IDLE);

  const updateTabular = useCallback((tabular: ParsedTabular) => {
    setContent((prev) => ({
      ...prev,
      tabular,
      text: serializeTabular(tabular),
    }));
  }, []);

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
        const ab = await res.arrayBuffer();
        if (cancelled) return;

        if (doc.format === 'xlsx' || doc.format === 'csv') {
          const csvSeparator = doc.format === 'csv'
            ? detectSeparator(new TextDecoder('utf-8').decode(ab).trim().split('\n')[0] ?? '')
            : null;
          setContent({ ...loadTabularContent(ab, doc, csvSeparator), updateTabular });
          return;
        }

        if (supportsDictionaryFormat(doc.format)) {
          try {
            setContent({ ...loadTabularContent(ab, doc), updateTabular });
            return;
          } catch {
            const text = new TextDecoder('utf-8').decode(ab);
            const parsed = parseTextForDictionary(text);
            setContent({
              text,
              tabular: parsed,
              csvSeparator: parsed ? detectSeparator(text.trim().split('\n')[0] ?? '') : null,
              textContent: parsed ? null : text,
              loading: false,
              error: parsed ? null : null,
              updateTabular,
            });
            return;
          }
        }

        const text = new TextDecoder('utf-8').decode(ab);
        setContent({
          text,
          tabular: null,
          csvSeparator: null,
          textContent: text,
          loading: false,
          error: null,
          updateTabular,
        });
      } catch (e) {
        if (!cancelled) {
          setContent({
            ...IDLE,
            error: e instanceof Error ? e.message : 'Failed to load',
            updateTabular,
          });
        }
      }
    })();

    return () => { cancelled = true; };
  }, [doc.id, fileUrl, doc.format, doc.name, updateTabular]);

  return { ...content, updateTabular };
}
