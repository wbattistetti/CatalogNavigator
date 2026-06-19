/**
 * Renders editor UI fragments into global App header slots.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export const PROJECT_TOOLBAR_SLOT_ID = 'project-toolbar-slot';
export const PROJECT_LEFT_ACTIONS_SLOT_ID = 'project-left-actions-slot';

export function ProjectToolbarPortal({
  children,
  slotId = PROJECT_TOOLBAR_SLOT_ID,
}: {
  children: ReactNode;
  slotId?: string;
}) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setSlot(document.getElementById(slotId));
  }, [slotId]);

  if (!slot) return null;
  return createPortal(children, slot);
}
