/**
 * Keeps dock panel bodies mounted after their first activation.
 */
import { useEffect, useState } from 'react';
import type { DockviewPanelApi } from 'dockview';

/** Returns true once the panel has been active at least once. */
export function useDockPanelRetained(panelApi: DockviewPanelApi): boolean {
  const [retained, setRetained] = useState(() => panelApi.isActive);

  useEffect(() => {
    if (panelApi.isActive) setRetained(true);

    const disposable = panelApi.onDidActiveChange(() => {
      if (panelApi.isActive) setRetained(true);
    });

    return () => disposable.dispose();
  }, [panelApi]);

  return retained;
}
