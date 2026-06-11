/**
 * Composite dictionary icons (multi-glyph) for categories that need richer metaphors.
 */
import { Baby, User, type LucideProps } from 'lucide-react';

/** Child + adult silhouettes partially overlapping — growth / age bands. */
export function AgeGrowthIcon({ className = '', strokeWidth = 2.25, color }: LucideProps) {
  return (
    <span
      className={`relative inline-flex items-end justify-center flex-shrink-0 ${className}`}
      style={{ color }}
      aria-hidden
    >
      <Baby
        className="absolute left-0 bottom-0 w-[46%] h-[46%]"
        strokeWidth={strokeWidth}
      />
      <User
        className="absolute right-0 bottom-0 w-[74%] h-[74%]"
        strokeWidth={strokeWidth}
      />
    </span>
  );
}
