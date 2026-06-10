/**
 * Document editor shell context: controller state + active tab navigation.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { KbDocument } from '../../lib/supabase';
import {
  useDocumentEditorController,
  type DocumentEditorController,
} from './useDocumentEditorController';
import { EDITOR_TAB_IDS, type EditorTabId } from './editorTabIds';

export type DocumentEditorContextValue = DocumentEditorController & {
  activeTab: EditorTabId;
  setActiveTab: (tab: EditorTabId) => void;
};

const DocumentEditorContext = createContext<DocumentEditorContextValue | null>(null);

export function useDocumentEditor(): DocumentEditorContextValue {
  const ctx = useContext(DocumentEditorContext);
  if (!ctx) {
    throw new Error('useDocumentEditor must be used within DocumentEditorProvider');
  }
  return ctx;
}

interface DocumentEditorProviderProps {
  doc: KbDocument;
  fileUrl: string;
  onDocUpdated: (doc: KbDocument) => void;
  children: ReactNode;
}

export function DocumentEditorProvider({
  doc,
  fileUrl,
  onDocUpdated,
  children,
}: DocumentEditorProviderProps) {
  const controller = useDocumentEditorController({ doc, fileUrl, onDocUpdated });
  const [activeTab, setActiveTab] = useState<EditorTabId>(EDITOR_TAB_IDS.document);
  const didAutoOntology = useRef(false);

  useEffect(() => {
    didAutoOntology.current = false;
    setActiveTab(EDITOR_TAB_IDS.document);
  }, [doc.id]);

  useEffect(() => {
    if (controller.content.tabular && controller.dictionaryMode && !didAutoOntology.current) {
      didAutoOntology.current = true;
      setActiveTab(EDITOR_TAB_IDS.ontology);
    }
  }, [controller.content.tabular, controller.dictionaryMode]);

  const value = useMemo(
    (): DocumentEditorContextValue => ({
      ...controller,
      activeTab,
      setActiveTab,
    }),
    [controller, activeTab],
  );

  return (
    <DocumentEditorContext.Provider value={value}>
      {children}
    </DocumentEditorContext.Provider>
  );
}
