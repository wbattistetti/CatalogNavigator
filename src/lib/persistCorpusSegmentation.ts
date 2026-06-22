/**
 * Load/save persisted corpus segmentation cache per document (Supabase).
 */
import { supabase } from './supabase';
import { yieldToMainThread } from './corpusSegmentationCache';
import type { CorpusSegmentationEntry } from './corpusSegmentationCache';

import {

  sanitizeSegmentationEntry,

  sanitizeSegmentationEntries,

  sanitizeStringForPostgresJsonb,

} from './postgresJsonbStrings';



export interface PersistedCorpusSegmentation {

  documentId: string;

  signature: string;

  uniqueTextCount: number;

  entries: Record<string, CorpusSegmentationEntry>;

  builtAt: string;

}



function isSegmentationEntry(value: unknown): value is CorpusSegmentationEntry {

  if (!value || typeof value !== 'object') return false;

  const entry = value as CorpusSegmentationEntry;

  return Array.isArray(entry.segments) && Array.isArray(entry.unmatched) && typeof entry.path === 'string';

}



/** Parses JSONB entries from storage. */

export function parsePersistedSegmentationEntries(

  raw: unknown,

): Record<string, CorpusSegmentationEntry> {

  if (!raw || typeof raw !== 'object') return {};

  const out: Record<string, CorpusSegmentationEntry> = {};

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {

    if (!key.trim() || !isSegmentationEntry(value)) continue;

    out[sanitizeStringForPostgresJsonb(key.trim())] = sanitizeSegmentationEntry(value);

  }

  return out;

}



export function corpusSegmentationCacheFromEntries(

  entries: Record<string, CorpusSegmentationEntry>,

): Map<string, CorpusSegmentationEntry> {

  return new Map(Object.entries(entries));

}



export function corpusSegmentationEntriesFromCache(

  cache: ReadonlyMap<string, CorpusSegmentationEntry>,

): Record<string, CorpusSegmentationEntry> {

  const entries: Record<string, CorpusSegmentationEntry> = {};

  for (const [key, value] of cache.entries()) {

    entries[key] = value;

  }

  return sanitizeSegmentationEntries(entries);

}



/** Whether persisted entries cover all unique corpus texts for the current layout. */

export function isPersistedSegmentationComplete(

  entryCount: number,

  targetUniqueTextCount: number,

): boolean {

  return targetUniqueTextCount > 0 && entryCount >= targetUniqueTextCount;

}



export function countPersistedSegmentationEntries(

  row: Pick<PersistedCorpusSegmentation, 'entries'>,

): number {

  return Object.keys(row.entries).length;

}



/** Loads persisted segmentation for a document, or null if missing. */

export async function loadPersistedCorpusSegmentation(

  documentId: string,

): Promise<PersistedCorpusSegmentation | null> {

  const { data, error } = await supabase

    .from('kb_corpus_segmentations')

    .select('document_id, signature, unique_text_count, entries, built_at')

    .eq('document_id', documentId)

    .maybeSingle();



  if (error) throw new Error(error.message);

  if (!data) return null;



  return {

    documentId: String(data.document_id),

    signature: String(data.signature),

    uniqueTextCount: Number(data.unique_text_count) || 0,

    entries: parsePersistedSegmentationEntries(data.entries),

    builtAt: String(data.built_at),

  };

}



/** Upserts the full segmentation cache for a document. */

export async function savePersistedCorpusSegmentation(
  documentId: string,
  signature: string,
  cache: ReadonlyMap<string, CorpusSegmentationEntry>,
): Promise<void> {
  await yieldToMainThread();
  const entries = corpusSegmentationEntriesFromCache(cache);
  const uniqueTextCount = Object.keys(entries).length;
  const now = new Date().toISOString();
  const safeSignature = sanitizeStringForPostgresJsonb(signature);
  await yieldToMainThread();

  const { error } = await supabase

    .from('kb_corpus_segmentations')

    .upsert({

      document_id: documentId,

      signature: safeSignature,

      unique_text_count: uniqueTextCount,

      entries,

      built_at: now,

      updated_at: now,

    }, { onConflict: 'document_id' });



  if (error) throw new Error(error.message);

}



/** Removes persisted segmentation for a document (start fresh). */

export async function deletePersistedCorpusSegmentation(documentId: string): Promise<void> {

  const { error } = await supabase

    .from('kb_corpus_segmentations')

    .delete()

    .eq('document_id', documentId);



  if (error) throw new Error(error.message);

}



/** Re-export for tests and callers that sanitized entries explicitly. */

export {

  sanitizeSegmentationEntry as sanitizeCorpusSegmentationEntry,

  sanitizeSegmentationEntries as sanitizeCorpusSegmentationEntries,

} from './postgresJsonbStrings';


