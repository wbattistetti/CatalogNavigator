/**
 * Tracks which editor workspaces have been mounted (first visit only).
 * No idle prefetch — background workspace mounts steal the main thread and break Glide scroll.
 */
import { useEffect, useState } from 'react';
import type { EditorTabId } from '../features/document-editor/editorTabIds';

export function useWorkspaceEagerMount(activeTab: EditorTabId): Set<EditorTabId> {
  const [mounted, setMounted] = useState<Set<EditorTabId>>(() => new Set([activeTab]));

  useEffect(() => {
    setMounted((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  return mounted;
}
