/**
 * Renders a dotted slot path with two alternating level colors.
 */

const LEVEL_COLORS = ['text-emerald-300', 'text-cyan-300'] as const;
const DOT_COLOR = 'text-emerald-400/35';

export function segmentColorClass(depth: number): string {
  return LEVEL_COLORS[depth % 2]!;
}

/** Full path with alternating colors per segment. */
export function SlotPathDisplay({ path, className = '' }: { path: string; className?: string }) {
  const segments = path.split('.');
  return (
    <span className={`font-mono text-xs break-all ${className}`}>
      {segments.map((seg, i) => (
        <span key={`${i}-${seg}`}>
          {i > 0 && <span className={DOT_COLOR}>.</span>}
          <span className={segmentColorClass(i)}>{seg}</span>
        </span>
      ))}
    </span>
  );
}

/** Last segment only, colored by its depth in the path. */
export function SlotLabelDisplay({ path, className = '' }: { path: string; className?: string }) {
  const segments = path.split('.');
  const depth = segments.length - 1;
  const label = segments[depth] ?? path;
  return (
    <span className={`font-mono text-xs ${segmentColorClass(depth)} ${className}`}>
      {label}
    </span>
  );
}
