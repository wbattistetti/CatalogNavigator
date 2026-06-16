/**
 * Renders a dotted slot path with two alternating level colors.
 */
import { categoryNameForToken, resolveTokenIcon } from '../../lib/categoryIconCatalog';
import type { TokenCategory } from '../../lib/dictionaryTree';
import { DictionaryIcon } from './DictionaryIcon';

const LEVEL_COLORS = ['text-emerald-300', 'text-cyan-300'] as const;
const DOT_COLOR = 'text-emerald-400/35';

export function segmentColorClass(depth: number): string {
  return LEVEL_COLORS[depth % 2]!;
}

/** Full path with alternating colors per segment. */
export function SlotPathDisplay({
  path,
  className = '',
  emphasizeLeaf = false,
}: {
  path: string;
  className?: string;
  /** Bolds the last segment (leaf label within the full path). */
  emphasizeLeaf?: boolean;
}) {
  const segments = path.split('.');
  const lastIdx = segments.length - 1;
  return (
    <span className={`font-mono text-sm break-all leading-relaxed ${className}`}>
      {segments.map((seg, i) => (
        <span key={`${i}-${seg}`}>
          {i > 0 && <span className={DOT_COLOR}>.</span>}
          <span
            className={`${segmentColorClass(i)}${emphasizeLeaf && i === lastIdx ? ' font-semibold' : ''}`}
          >
            {seg}
          </span>
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
    <span className={`font-mono text-sm ${segmentColorClass(depth)} ${className}`}>
      {label}
    </span>
  );
}

/** Last segment with dictionary category icon and accent color. */
export function SlotCategoryLabelDisplay({
  path,
  categories,
  className = '',
  bold = false,
}: {
  path: string;
  categories: TokenCategory[];
  className?: string;
  bold?: boolean;
}) {
  const segments = path.split('.');
  const label = segments[segments.length - 1] ?? path;
  const icon = resolveTokenIcon(categories, label);
  const categoryName = categoryNameForToken(label, categories);

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-sm min-w-0 ${className}`}
      title={categoryName}
    >
      <DictionaryIcon iconKey={icon.iconKey} iconColor={icon.iconColor} size="sm" />
      <span
        className={`truncate ${bold ? 'font-semibold' : ''}`}
        style={{ color: icon.iconColor }}
      >
        {label}
      </span>
    </span>
  );
}
