/**
 * Placeholder shell for dock panels that are not yet mounted.
 */
import type { ReactNode } from 'react';

export function DockPanelRetained({
  mounted,
  children,
  className = 'h-full min-h-0 flex flex-col',
}: {
  mounted: boolean;
  children: ReactNode;
  className?: string;
}) {
  if (!mounted) {
    return <div className="h-full min-h-0 bg-[#070d09]" aria-hidden />;
  }

  return <div className={className}>{children}</div>;
}
