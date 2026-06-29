/**
 * Clear control overlaid on the corpus extra column header.
 */
interface CorpusExtraColumnHeaderClearProps {
  leftPx: number;
  widthPx: number;
  headerHeightPx: number;
  hasAnnotations: boolean;
  onClear: () => void;
}

export function CorpusExtraColumnHeaderClear({
  leftPx,
  widthPx,
  headerHeightPx,
  hasAnnotations,
  onClear,
}: CorpusExtraColumnHeaderClearProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hasAnnotations) return;
    if (!window.confirm('Rimuovere tutti i chip dalla colonna extra?')) return;
    onClear();
  };

  return (
    <div
      className="pointer-events-none absolute top-0 z-20 flex items-center justify-end px-1"
      style={{ left: leftPx, width: widthPx, height: headerHeightPx }}
    >
      <button
        type="button"
        onClick={handleClick}
        disabled={!hasAnnotations}
        title="Svuota colonna extra"
        className="pointer-events-auto rounded border border-emerald-400/25 bg-[#0a1210]/90 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-emerald-300/80 transition-colors hover:border-red-400/40 hover:bg-red-950/40 hover:text-red-300 disabled:pointer-events-none disabled:opacity-30"
      >
        Clear
      </button>
    </div>
  );
}
