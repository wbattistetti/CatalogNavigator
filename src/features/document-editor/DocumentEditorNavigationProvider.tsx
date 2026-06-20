/**
 * Tab and dictionary navigation state — isolated so tab switches do not re-run the data controller.
 */
import {
  useCallback,
  useEffect,
  useMemo,
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
  splitLayoutIncludesTab,
  type EditorSplitLayout,
} from './documentEditorSplitLayout';

export function DocumentEditorNavigationProvider({ children }: { children: ReactNode }) {
  const controller = useDocumentEditorController();
  const [activeTab, setActiveTabState] = useState<EditorTabId>(EDITOR_TAB_IDS.document);
  const [splitLayout, setSplitLayoutState] = useState<EditorSplitLayout>({ type: 'single' });
  const [dictionaryTreeFocus, setDictionaryTreeFocus] = useState<DictionaryTreeFocusRequest | null>(null);
  const [dictionaryAliasPick, setDictionaryAliasPick] = useState<DictionaryAliasPickRequest | null>(null);

  const projectDictionaryId = useMemo(
    () => controller.dicts.projectDictionaryId ?? controller.dicts.editingDictionaryId,
    [controller.dicts.projectDictionaryId, controller.dicts.editingDictionaryId],
  );

  const visibleTabs = useMemo(() => {
    const tabs = new Set<EditorTabId>([
      EDITOR_TAB_IDS.document,
    ]);
    if (controller.dictionaryMode) {
      tabs.add(EDITOR_TAB_IDS.dictionaries);
    }
    if (controller.showOntologyTab) {
      tabs.add(EDITOR_TAB_IDS.ontology);
      tabs.add(EDITOR_TAB_IDS.disambiguation);
    }
    if (controller.showOntologyTab && controller.catalogSanityHasIssues) {
      tabs.add(EDITOR_TAB_IDS.report);
    }
    return tabs;
  }, [controller.dictionaryMode, controller.showOntologyTab, controller.catalogSanityHasIssues]);

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
    setActiveTabState(EDITOR_TAB_IDS.document);
    setSplitLayoutState({ type: 'single' });
    setDictionaryTreeFocus(null);
    setDictionaryAliasPick(null);
  }, [controller.doc.id]);

  useEffect(() => {
    setSplitLayoutState((prev) => normalizeSplitLayout(prev, visibleTabs));
  }, [visibleTabs]);

  useEffect(() => {
    if (
      (activeTab === EDITOR_TAB_IDS.ontology
        || activeTab === EDITOR_TAB_IDS.disambiguation
        || activeTab === EDITOR_TAB_IDS.report)
      && !controller.showOntologyTab
    ) {
      setActiveTabState(EDITOR_TAB_IDS.document);
    }
  }, [activeTab, controller.showOntologyTab]);

  useEffect(() => {
    if (!controller.disambiguationNavRequest || !controller.showOntologyTab) return;
    setActiveTabState(EDITOR_TAB_IDS.disambiguation);
    setSplitLayoutState({ type: 'single' });
  }, [controller.disambiguationNavRequest, controller.showOntologyTab]);

  useEffect(() => {
    if (!controller.pendingCatalogReportTab) return;
    if (!controller.catalogSanityHasIssues || !controller.showOntologyTab) {
      controller.clearPendingCatalogReportTab();
      return;
    }
    setActiveTabState(EDITOR_TAB_IDS.report);
    setSplitLayoutState({ type: 'single' });
    controller.clearPendingCatalogReportTab();
  }, [
    controller.pendingCatalogReportTab,
    controller.catalogSanityHasIssues,
    controller.showOntologyTab,
    controller.clearPendingCatalogReportTab,
  ]);

  useEffect(() => {
    if (activeTab !== EDITOR_TAB_IDS.report) return;
    if (controller.catalogSanityHasIssues) return;
    setActiveTabState(EDITOR_TAB_IDS.ontology);
  }, [activeTab, controller.catalogSanityHasIssues]);

  const openDictionaryTree = useCallback((opts?: { dictionaryId?: string; focusToken?: string }) => {
    const id = opts?.dictionaryId ?? projectDictionaryId;
    if (!id) return;
    controller.dicts.openDictionaryEditor(id);
    controller.dicts.focusDictionaryEditor(id);

    const dictionariesAlreadyVisible = splitLayoutIncludesTab(splitLayout, EDITOR_TAB_IDS.dictionaries);
    if (!dictionariesAlreadyVisible) {
      setActiveTabState(EDITOR_TAB_IDS.dictionaries);
      setSplitLayoutState({ type: 'single' });
    }

    if (opts?.focusToken) {
      setDictionaryTreeFocus({ dictionaryId: id, tokenText: opts.focusToken });
    }
  }, [controller.dicts, projectDictionaryId, splitLayout]);

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
