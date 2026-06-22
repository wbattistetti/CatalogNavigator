/**
 * Document editor shell provider: data controller + isolated navigation state.
 */
import type { ReactNode } from 'react';
import type { KbDocument } from '../../lib/supabase';
import { useDocumentEditorController as useControllerHook } from './useDocumentEditorController';
import { DictionarySelectionProvider } from './DictionarySelectionProvider';
import { DocumentEditorNavigationProvider } from './DocumentEditorNavigationProvider';
import { OntologyCorpusSegmentationProvider } from '../ontology-corpus/OntologyCorpusSegmentationContext';
import {
  DocumentEditorControllerContext,
  type DictionaryAliasPickRequest,
  type DictionaryTreeFocusRequest,
  type DocumentEditorContextValue,
} from './documentEditorContextDef';
import {
  DictionaryCatalogContext,
  DictionarySessionActionsContext,
} from './dictionaryEditorApiContext';

export type {
  DictionaryAliasPickRequest,
  DictionaryTreeFocusRequest,
  DocumentEditorContextValue,
};
export {
  useDocumentEditor,
  useDocumentEditorController,
  useDocumentEditorTab,
  useDocumentEditorDictionaryNav,
} from './documentEditorContextDef';
export {
  useDictionaryCatalog,
  useDictionarySessionActions,
} from './dictionaryEditorApiContext';

interface DocumentEditorProviderProps {
  doc: KbDocument;
  fileUrl: string;
  onDocUpdated: (doc: KbDocument) => void;
  children: ReactNode;
}

function DocumentEditorControllerProvider({
  doc,
  fileUrl,
  onDocUpdated,
  children,
}: DocumentEditorProviderProps) {
  const controller = useControllerHook({ doc, fileUrl, onDocUpdated });

  return (
    <DocumentEditorControllerContext.Provider value={controller}>
      <DictionaryCatalogContext.Provider value={controller.dictionaryCatalog}>
        <DictionarySessionActionsContext.Provider value={controller.dictionarySessionActions}>
          <OntologyCorpusSegmentationProvider value={controller.corpusSegmentationContextValue}>
            {children}
          </OntologyCorpusSegmentationProvider>
        </DictionarySessionActionsContext.Provider>
      </DictionaryCatalogContext.Provider>
    </DocumentEditorControllerContext.Provider>
  );
}

export function DocumentEditorProvider({
  doc,
  fileUrl,
  onDocUpdated,
  children,
}: DocumentEditorProviderProps) {
  return (
    <DocumentEditorControllerProvider doc={doc} fileUrl={fileUrl} onDocUpdated={onDocUpdated}>
      <DictionarySelectionProvider docId={doc.id}>
        <DocumentEditorNavigationProvider>
          {children}
        </DocumentEditorNavigationProvider>
      </DictionarySelectionProvider>
    </DocumentEditorControllerProvider>
  );
}
