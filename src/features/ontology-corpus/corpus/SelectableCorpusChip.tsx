/**
 * Corpus chip with per-chip selection subscription.
 */
import { memo } from 'react';
import { X } from 'lucide-react';
import { DictionaryIcon } from '../../../components/DocumentViewer/DictionaryIcon';
import { chipSurfaceStyleFromColor } from '../../../lib/categoryIconCatalog';
import {
  useDictionaryChipDragging,
  useDictionaryChipSelected,
} from '../../../features/document-editor/dictionarySelectionStore';
import { useCorpusChipActions } from '../../../components/DocumentViewer/CorpusChipActionsContext';
import { aliasCanonicalHint } from '../../../lib/tokenDictionary';

export const SelectableCorpusChip = memo(function SelectableCorpusChip({
  canonical,
  categorizable,
  label,
  sourceStart,
  sourceEnd,
  showAliasHint = true,
  muted = false,
  variant = 'token',
  aliasOf,
  className = '',
  iconKey,
  iconColor,
  categoryColor,
  iconTitle,
  dictScope = 'project',
  onRemove,
  removeTitle,
}: {
  canonical: string;
  categorizable: boolean;
  label: string;
  sourceStart?: number;
  sourceEnd?: number;
  showAliasHint?: boolean;
  muted?: boolean;
  variant?: 'token' | 'alias';
  aliasOf?: string;
  className?: string;
  iconKey?: string;
  iconColor?: string;
  categoryColor?: string;
  iconTitle?: string;
  dictScope?: 'project' | 'library';
  onRemove?: () => void;
  removeTitle?: string;
}) {
  const selected = useDictionaryChipSelected(canonical);
  const dragging = useDictionaryChipDragging(canonical);
  const { onChipClick, onChipMouseDown } = useCorpusChipActions();
  const isAlias = variant === 'alias';
  const accent = categoryColor ?? iconColor;
  const tinted = accent && !muted && !isAlias
    ? chipSurfaceStyleFromColor(accent)
    : null;
  const selectionClass = categorizable && selected
    ? dragging
      ? 'border-2 border-emerald-300 opacity-90 cursor-grabbing shadow-[0_0_6px_rgba(52,211,153,0.45)]'
      : 'border-2 border-emerald-400 cursor-grab shadow-[0_0_6px_rgba(52,211,153,0.35)]'
    : categorizable
      ? 'cursor-text'
      : '';

  return (
    <span
      role={categorizable ? 'option' : undefined}
      aria-selected={categorizable ? selected : undefined}
      data-corpus-chip={categorizable ? 'true' : undefined}
      data-source-start={sourceStart}
      data-source-end={sourceEnd}
      onClick={categorizable ? (e) => onChipClick(e, canonical) : undefined}
      onMouseDown={categorizable ? (e) => onChipMouseDown(e, canonical) : undefined}
      className={`inline-flex items-center gap-0.5 px-2 py-1 rounded-md border font-mono text-[11px] leading-none whitespace-nowrap group/chip select-text ${
        muted
          ? 'bg-[#0f1a12] border-[#1a3a2a] text-emerald-300/75'
          : isAlias
            ? dictScope === 'project'
              ? 'bg-amber-400/15 border-amber-400/35 text-amber-100'
              : 'bg-sky-400/20 border-sky-400/40 text-sky-100'
            : tinted
              ? ''
              : dictScope === 'library'
                ? 'bg-sky-400/20 border-sky-400/40 text-sky-100'
                : 'bg-amber-400/20 border-amber-400/40 text-amber-100'
      } ${selectionClass} ${className}`}
      style={tinted ? {
        backgroundColor: tinted.backgroundColor,
        borderColor: tinted.borderColor,
        color: tinted.color,
      } : undefined}
      title={iconTitle ?? (isAlias && aliasOf ? `alias of: ${aliasOf}` : undefined)}
    >
      {iconKey && iconColor && (
        <span className="select-none pointer-events-none flex-shrink-0" aria-hidden>
          <DictionaryIcon iconKey={iconKey} iconColor={iconColor} size="xs" />
        </span>
      )}
      <span className="select-text">
        {label}
        {showAliasHint && isAlias && aliasOf && (
          <span className="select-none text-sky-300/50"> ({aliasCanonicalHint(aliasOf)})</span>
        )}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title={removeTitle ?? (isAlias ? 'Rimuovi alias' : 'Rimuovi token')}
          className="flex-shrink-0 p-0.5 rounded opacity-0 group-hover/chip:opacity-100 text-red-400/70 hover:text-red-300 hover:bg-red-400/15 transition-all"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </span>
  );
});
