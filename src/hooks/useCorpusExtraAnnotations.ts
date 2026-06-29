/**
 * In-memory per-row extra column tokens; persisted only when analysis is saved.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Analysis } from '../lib/analysisTypes';
import {
  appendExtraTokens,
  corpusExtraAnnotationsFromStorage,
  corpusExtraAnnotationsToStorage,
  removeExtraToken,
} from '../lib/corpusExtraAnnotations';
import { logCorpusExtraDrop } from '../lib/corpusExtraDropDebug';

function storageKey(raw: Analysis['corpus_extra_annotations']): string {
  return JSON.stringify(raw ?? null);
}

export function useCorpusExtraAnnotations(
  documentId: string,
  analysis: Analysis | null,
  analysisDirty: boolean,
  updateStorage: (storage: Record<string, string[]>) => void,
) {
  const [extraAnnotations, setExtraAnnotations] = useState<Map<number, string[]>>(() => new Map());
  const localUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedStorageKeyRef = useRef<string>('');
  const lastDocumentIdRef = useRef(documentId);
  const localRevisionRef = useRef(0);
  const prevAnalysisDirtyRef = useRef(analysisDirty);

  useEffect(() => {
    const nextKey = storageKey(analysis?.corpus_extra_annotations);
    if (lastDocumentIdRef.current !== documentId) {
      lastDocumentIdRef.current = documentId;
      lastSyncedStorageKeyRef.current = nextKey;
      localRevisionRef.current = 0;
      setExtraAnnotations(corpusExtraAnnotationsFromStorage(analysis?.corpus_extra_annotations));
      return;
    }
    if (nextKey === lastSyncedStorageKeyRef.current) return;
    if (localRevisionRef.current > 0) return;
    lastSyncedStorageKeyRef.current = nextKey;
    setExtraAnnotations(corpusExtraAnnotationsFromStorage(analysis?.corpus_extra_annotations));
  }, [documentId, analysis?.corpus_extra_annotations]);

  useEffect(() => {
    if (prevAnalysisDirtyRef.current && !analysisDirty) {
      localRevisionRef.current = 0;
      const nextKey = storageKey(analysis?.corpus_extra_annotations);
      lastSyncedStorageKeyRef.current = nextKey;
      setExtraAnnotations(corpusExtraAnnotationsFromStorage(analysis?.corpus_extra_annotations));
    }
    prevAnalysisDirtyRef.current = analysisDirty;
  }, [analysisDirty, analysis?.corpus_extra_annotations]);

  const scheduleLocalUpdate = useCallback((nextMap: Map<number, string[]>) => {
    if (localUpdateTimerRef.current) clearTimeout(localUpdateTimerRef.current);
    localUpdateTimerRef.current = setTimeout(() => {
      const storage = corpusExtraAnnotationsToStorage(nextMap);
      const persistedValue = Object.keys(storage).length > 0 ? storage : null;
      updateStorage(storage);
      lastSyncedStorageKeyRef.current = storageKey(persistedValue);
      logCorpusExtraDrop('extraAnnotations.localUpdated', { nextKey: lastSyncedStorageKeyRef.current });
    }, 400);
  }, [updateStorage]);

  useEffect(() => () => { if (localUpdateTimerRef.current) clearTimeout(localUpdateTimerRef.current); }, []);

  const addExtraTokens = useCallback((rowIndices: readonly number[], tokenTexts: readonly string[]) => {
    if (!rowIndices.length || !tokenTexts.length) return;
    logCorpusExtraDrop('addExtraTokens', { rowIndices: [...rowIndices], tokenTexts: [...tokenTexts] });
    localRevisionRef.current += 1;
    setExtraAnnotations((prev) => {
      let next = prev;
      for (const rowIndex of rowIndices) next = appendExtraTokens(next, rowIndex, tokenTexts);
      scheduleLocalUpdate(next);
      return next;
    });
  }, [scheduleLocalUpdate]);

  const removeExtraTokenAt = useCallback((rowIndex: number, tokenText: string, occurrenceIndex0Based = 0) => {
    localRevisionRef.current += 1;
    setExtraAnnotations((prev) => {
      const next = removeExtraToken(prev, rowIndex, tokenText, occurrenceIndex0Based);
      scheduleLocalUpdate(next);
      return next;
    });
  }, [scheduleLocalUpdate]);

  const clearAllExtraAnnotations = useCallback(() => {
    if (localUpdateTimerRef.current) clearTimeout(localUpdateTimerRef.current);
    localRevisionRef.current += 1;
    const empty = new Map<number, string[]>();
    setExtraAnnotations(empty);
    updateStorage({});
    lastSyncedStorageKeyRef.current = storageKey(null);
    logCorpusExtraDrop('extraAnnotations.clearedAll', {});
  }, [updateStorage]);

  return { extraAnnotations, addExtraTokens, removeExtraTokenAt, clearAllExtraAnnotations };
}
