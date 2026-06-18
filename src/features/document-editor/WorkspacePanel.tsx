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
    <div
      aria-hidden={!active}
      className={
        active
          ? 'absolute inset-0 flex flex-col min-w-0 min-h-0 overflow-hidden z-[1]'
          : 'absolute inset-0 flex flex-col min-w-0 min-h-0 overflow-hidden invisible pointer-events-none z-0'
      }
      style={active ? undefined : { contentVisibility: 'hidden', contain: 'strict' }}
    >
      <div className="flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
