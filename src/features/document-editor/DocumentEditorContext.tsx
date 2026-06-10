/**
 * Document editor shell context: controller state + active tab navigation.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { SelectionRange } from '../../lib/tokenDictionary';
import type { KbDocument } from '../../lib/supabase';
import {
  useDocumentEditorController,
  type DocumentEditorController,
} from './useDocumentEditorController';
import { EDITOR_TAB_IDS, type EditorTabId } from './editorTabIds';
import { DictionarySelectionProvider } from './DictionarySelectionProvider';

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

export type DocumentEditorContextValue = DocumentEditorController & {
  activeTab: EditorTabId;
  setActiveTab: (tab: EditorTabId) => void;
  /** Opens Dizionari tab and focuses a dictionary editor (defaults to project dict). */
  openDictionaryTree: (opts?: { dictionaryId?: string; focusToken?: string }) => void;
  dictionaryTreeFocus: DictionaryTreeFocusRequest | null;
  clearDictionaryTreeFocus: () => void;
  dictionaryAliasPick: DictionaryAliasPickRequest | null;
  startDictionaryAliasPick: (pick: Omit<DictionaryAliasPickRequest, 'dictionaryId'>) => void;
  cancelDictionaryAliasPick: () => void;
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
  const [dictionaryTreeFocus, setDictionaryTreeFocus] = useState<DictionaryTreeFocusRequest | null>(null);
  const [dictionaryAliasPick, setDictionaryAliasPick] = useState<DictionaryAliasPickRequest | null>(null);
  const didAutoOntology = useRef(false);

  const projectDictionaryId = useMemo(
    () => controller.dicts.projectDicts[0]?.id ?? controller.dicts.editingDictionaryId,
    [controller.dicts.projectDicts, controller.dicts.editingDictionaryId],
  );

  useEffect(() => {
    didAutoOntology.current = false;
    setActiveTab(EDITOR_TAB_IDS.document);
    setDictionaryTreeFocus(null);
    setDictionaryAliasPick(null);
  }, [doc.id]);

  useEffect(() => {
    if (controller.content.tabular && controller.dictionaryMode && !didAutoOntology.current) {
      didAutoOntology.current = true;
      setActiveTab(EDITOR_TAB_IDS.ontology);
    }
  }, [controller.content.tabular, controller.dictionaryMode]);

  const openDictionaryTree = useCallback((opts?: { dictionaryId?: string; focusToken?: string }) => {
    const id = opts?.dictionaryId ?? projectDictionaryId;
    if (!id) return;
    controller.dicts.openDictionaryEditor(id);
    controller.dicts.focusDictionaryEditor(id);
    setActiveTab(EDITOR_TAB_IDS.dictionaries);
    if (opts?.focusToken) {
      setDictionaryTreeFocus({ dictionaryId: id, tokenText: opts.focusToken });
    }
  }, [controller.dicts, projectDictionaryId]);

  const clearDictionaryTreeFocus = useCallback(() => {
    setDictionaryTreeFocus(null);
  }, []);

  const startDictionaryAliasPick = useCallback((
    pick: Omit<DictionaryAliasPickRequest, 'dictionaryId'>,
  ) => {
    const id = projectDictionaryId;
    if (!id) return;
    setDictionaryAliasPick({ ...pick, dictionaryId: id });
    openDictionaryTree({ dictionaryId: id });
  }, [openDictionaryTree, projectDictionaryId]);

  const cancelDictionaryAliasPick = useCallback(() => {
    setDictionaryAliasPick(null);
  }, []);

  const value = useMemo(
    (): DocumentEditorContextValue => ({
      ...controller,
      activeTab,
      setActiveTab,
      openDictionaryTree,
      dictionaryTreeFocus,
      clearDictionaryTreeFocus,
      dictionaryAliasPick,
      startDictionaryAliasPick,
      cancelDictionaryAliasPick,
    }),
    [
      controller,
      activeTab,
      openDictionaryTree,
      dictionaryTreeFocus,
      clearDictionaryTreeFocus,
      dictionaryAliasPick,
      startDictionaryAliasPick,
      cancelDictionaryAliasPick,
    ],
  );

  return (
    <DocumentEditorContext.Provider value={value}>
      <DictionarySelectionProvider docId={doc.id}>
        {children}
      </DictionarySelectionProvider>
    </DocumentEditorContext.Provider>
  );
}
