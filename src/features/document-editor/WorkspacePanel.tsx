/**
 * Renders one workspace when its tab is active. Inactive tabs unmount completely
 * so hidden Glide grids and dock layouts do not block document scroll.
 */
import type { ReactNode } from 'react';

interface WorkspacePanelProps {
  active: boolean;
  children: ReactNode;
}

export function WorkspacePanel({ active, children }: WorkspacePanelProps) {
  if (!active) return null;

  return (
    <div className="absolute inset-0 flex flex-col min-w-0 min-h-0 overflow-hidden">
      <div className="flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
