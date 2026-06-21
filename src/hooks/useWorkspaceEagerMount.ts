/**
 * Tracks which editor workspaces have been mounted; prefetches the rest immediately on idle.
 */
import { useEffect, useState } from 'react';
import type { EditorTabId } from '../features/document-editor/editorTabIds';
import { EDITOR_TAB_IDS } from '../features/document-editor/editorTabIds';

const DICTIONARY_WORKSPACES: EditorTabId[] = [
  EDITOR_TAB_IDS.dictionaries,
  EDITOR_TAB_IDS.ontology,
  EDITOR_TAB_IDS.disambiguation,
  EDITOR_TAB_IDS.testPlan,
];

export function useWorkspaceEagerMount(
  activeTab: EditorTabId,
  prefetch: boolean,
): Set<EditorTabId> {
  const [mounted, setMounted] = useState<Set<EditorTabId>>(() => new Set([activeTab]));

  useEffect(() => {
    setMounted((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  useEffect(() => {
    if (!prefetch) return;

    const prefetchAll = () => {
      setMounted((prev) => {
        const next = new Set(prev);
        for (const id of DICTIONARY_WORKSPACES) next.add(id);
        return next;
      });
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const id = window.requestIdleCallback(prefetchAll, { timeout: 200 });
      return () => window.cancelIdleCallback(id);
    }

    prefetchAll();
    return undefined;
  }, [prefetch]);

  return mounted;
}
