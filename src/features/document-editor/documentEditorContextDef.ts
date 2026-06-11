/**
 * Stable React contexts for the document editor (separate module for HMR safety).
 */
import { createContext, useContext } from 'react';
import type { SelectionRange } from '../../lib/tokenDictionary';
import type { DocumentEditorController } from './useDocumentEditorController';
import type { EditorTabId } from './editorTabIds';
import type { EditorSplitLayout } from './documentEditorSplitLayout';

/** Alias pick started from the ontology corpus — completed in Dizionari tree. */
export interface DictionaryAliasPickRequest {
  phrase: string;
  range: SelectionRange | null;
  normalizedPhrase: string;
  dictionaryId: string;
}

export interface DictionaryTreeFocusRequest {
  dictionaryId: string;
  tokenText: string;
}

export interface DocumentEditorTabApi {
  activeTab: EditorTabId;
  setActiveTab: (tab: EditorTabId) => void;
  splitLayout: EditorSplitLayout;
  setSplitLayout: (layout: EditorSplitLayout) => void;
}

export interface DocumentEditorDictionaryNavApi {
  openDictionaryTree: (opts?: { dictionaryId?: string; focusToken?: string }) => void;
  dictionaryTreeFocus: DictionaryTreeFocusRequest | null;
  clearDictionaryTreeFocus: () => void;
  dictionaryAliasPick: DictionaryAliasPickRequest | null;
  startDictionaryAliasPick: (pick: Omit<DictionaryAliasPickRequest, 'dictionaryId'>) => void;
  cancelDictionaryAliasPick: () => void;
}

export type DocumentEditorContextValue = DocumentEditorController
  & DocumentEditorTabApi
  & DocumentEditorDictionaryNavApi;

export const DocumentEditorControllerContext = createContext<DocumentEditorController | null>(null);
export const DocumentEditorTabContext = createContext<DocumentEditorTabApi | null>(null);
export const DocumentEditorDictionaryNavContext = createContext<DocumentEditorDictionaryNavApi | null>(null);

/** @deprecated Use split hooks when a component must not re-render on tab changes. */
export const DocumentEditorContext = DocumentEditorControllerContext;

export function useDocumentEditorController(): DocumentEditorController {
  const ctx = useContext(DocumentEditorControllerContext);
  if (!ctx) {
    throw new Error('useDocumentEditorController must be used within DocumentEditorProvider');
  }
  return ctx;
}

export function useDocumentEditorTab(): DocumentEditorTabApi {
  const ctx = useContext(DocumentEditorTabContext);
  if (!ctx) {
    throw new Error('useDocumentEditorTab must be used within DocumentEditorProvider');
  }
  return ctx;
}

export function useDocumentEditorDictionaryNav(): DocumentEditorDictionaryNavApi {
  const ctx = useContext(DocumentEditorDictionaryNavContext);
  if (!ctx) {
    throw new Error('useDocumentEditorDictionaryNav must be used within DocumentEditorProvider');
  }
  return ctx;
}

export function useDocumentEditor(): DocumentEditorContextValue {
  return {
    ...useDocumentEditorController(),
    ...useDocumentEditorTab(),
    ...useDocumentEditorDictionaryNav(),
  };
}
