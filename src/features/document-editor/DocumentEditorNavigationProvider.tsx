/**
 * Tab and dictionary navigation state — isolated so tab switches do not re-run the data controller.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { EDITOR_TAB_IDS, type EditorTabId } from './editorTabIds';
import {
  DocumentEditorDictionaryNavContext,
  DocumentEditorTabContext,
  type DictionaryAliasPickRequest,
  type DictionaryTreeFocusRequest,
  useDocumentEditorController,
} from './documentEditorContextDef';
import {
  normalizeSplitLayout,
  type EditorSplitLayout,
} from './documentEditorSplitLayout';

export function DocumentEditorNavigationProvider({ children }: { children: ReactNode }) {
  const controller = useDocumentEditorController();
  const [activeTab, setActiveTabState] = useState<EditorTabId>(EDITOR_TAB_IDS.document);
  const [splitLayout, setSplitLayoutState] = useState<EditorSplitLayout>({ type: 'single' });
  const [dictionaryTreeFocus, setDictionaryTreeFocus] = useState<DictionaryTreeFocusRequest | null>(null);
  const [dictionaryAliasPick, setDictionaryAliasPick] = useState<DictionaryAliasPickRequest | null>(null);
  const didAutoOntology = useRef(false);

  const projectDictionaryId = useMemo(
    () => controller.dicts.projectDicts[0]?.id ?? controller.dicts.editingDictionaryId,
    [controller.dicts.projectDicts, controller.dicts.editingDictionaryId],
  );

  const visibleTabs = useMemo(() => {
    const tabs = new Set<EditorTabId>([
      EDITOR_TAB_IDS.document,
      EDITOR_TAB_IDS.agent,
    ]);
    if (controller.dictionaryMode) {
      tabs.add(EDITOR_TAB_IDS.dictionaries);
      tabs.add(EDITOR_TAB_IDS.ontology);
    }
    return tabs;
  }, [controller.dictionaryMode]);

  const setActiveTab = useCallback((tab: EditorTabId) => {
    setActiveTabState(tab);
    setSplitLayoutState({ type: 'single' });
  }, []);

  const setSplitLayout = useCallback((layout: EditorSplitLayout) => {
    const normalized = normalizeSplitLayout(layout, visibleTabs);
    if (normalized.type === 'split') {
      setActiveTabState(normalized.primary);
    }
    setSplitLayoutState(normalized);
  }, [visibleTabs]);

  useEffect(() => {
    didAutoOntology.current = false;
    setActiveTabState(EDITOR_TAB_IDS.document);
    setSplitLayoutState({ type: 'single' });
    setDictionaryTreeFocus(null);
    setDictionaryAliasPick(null);
  }, [controller.doc.id]);

  useEffect(() => {
    setSplitLayoutState((prev) => normalizeSplitLayout(prev, visibleTabs));
  }, [visibleTabs]);

  useEffect(() => {
    if (controller.content.tabular && controller.dictionaryMode && !didAutoOntology.current) {
      didAutoOntology.current = true;
      setActiveTabState(EDITOR_TAB_IDS.ontology);
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
  }, [controller.dicts, projectDictionaryId, setActiveTab]);

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

  const tabApi = useMemo(
    () => ({ activeTab, setActiveTab, splitLayout, setSplitLayout }),
    [activeTab, setActiveTab, splitLayout, setSplitLayout],
  );

  const dictionaryNavApi = useMemo(
    () => ({
      openDictionaryTree,
      dictionaryTreeFocus,
      clearDictionaryTreeFocus,
      dictionaryAliasPick,
      startDictionaryAliasPick,
      cancelDictionaryAliasPick,
    }),
    [
      openDictionaryTree,
      dictionaryTreeFocus,
      clearDictionaryTreeFocus,
      dictionaryAliasPick,
      startDictionaryAliasPick,
      cancelDictionaryAliasPick,
    ],
  );

  return (
    <DocumentEditorTabContext.Provider value={tabApi}>
      <DocumentEditorDictionaryNavContext.Provider value={dictionaryNavApi}>
        {children}
      </DocumentEditorDictionaryNavContext.Provider>
    </DocumentEditorTabContext.Provider>
  );
}
