/**
 * Keeps a workspace mounted but hidden when inactive (preserves internal state).
 */
import type { ReactNode } from 'react';

interface WorkspacePanelProps {
  active: boolean;
  children: ReactNode;
}

export function WorkspacePanel({ active, children }: WorkspacePanelProps) {
  return (
    <div className={active ? 'absolute inset-0 flex flex-col' : 'hidden'}>
      {children}
    </div>
  );
}
