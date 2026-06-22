/**
 * Overlay editor with interactive segmentation chips for the Glide benchmark.
 */
import { useCallback, useState } from 'react';
import { X } from 'lucide-react';
import {
  GridCellKind,
  type CustomCell,
  type GridCell,
  type ProvideEditorComponent,
} from '@glideapps/glide-data-grid';
import { DictionaryIcon } from '../../components/DocumentViewer/DictionaryIcon';
import { chipSurfaceStyleFromColor } from '../../lib/categoryIconCatalog';
import { isGlideBenchSegCell } from './glideBenchSegmentationRenderer';
import type { GlideBenchSegCellData } from './glideBenchTypes';

function GlideBenchSegmentationEditorInner({
  value,
  onFinishedEditing,
}: {
  value: CustomCell<GlideBenchSegCellData>;
  onFinishedEditing: (newValue?: GridCell) => void;
}) {
  const [segments, setSegments] = useState(value.data.segments);

  const removeSegment = useCallback((index: number) => {
    setSegments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const finish = useCallback(() => {
    onFinishedEditing({
      ...value,
      data: {
        ...value.data,
        segments,
      },
    });
  }, [onFinishedEditing, value, segments]);

  const { sourceText, unmatched } = value.data;

  return (
    <div
      className="min-w-[280px] max-w-[520px] rounded border border-[#1a3a2a] bg-[#0a1510] p-3 shadow-xl"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <p className="mb-2 font-mono text-[10px] text-emerald-400/50 line-clamp-2" title={sourceText}>
        {sourceText}
      </p>

      {segments.length === 0 ? (
        <p className="font-mono text-xs italic text-emerald-400/55">Nessun segmento</p>
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          {segments.map((seg, i) => {
            const tinted = chipSurfaceStyleFromColor(seg.fgColor);
            return (
              <span key={`${seg.text}-${i}`} className="inline-flex items-center gap-0.5">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border font-mono text-[11px] leading-tight whitespace-nowrap hover:brightness-110 transition-all"
                  style={{
                    backgroundColor: tinted.backgroundColor,
                    borderColor: tinted.borderColor,
                    color: tinted.color,
                  }}
                  title="Chip interattivo (benchmark)"
                >
                  <DictionaryIcon iconKey="Pill" iconColor={seg.fgColor} className="w-3 h-3 opacity-80" />
                  {seg.text}
                  <span
                    role="button"
                    tabIndex={0}
                    className="ml-0.5 opacity-60 hover:opacity-100 hover:text-red-300"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSegment(i);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.stopPropagation();
                        removeSegment(i);
                      }
                    }}
                    title="Rimuovi (solo overlay benchmark)"
                  >
                    <X className="w-3 h-3" />
                  </span>
                </button>
                {i < segments.length - 1 && (
                  <span className="text-emerald-400/60 font-mono text-xs">·</span>
                )}
              </span>
            );
          })}
        </div>
      )}

      {unmatched.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <span className="font-mono text-[9px] text-amber-400/50">unmatched</span>
          {unmatched.map((word, i) => (
            <span
              key={`${word}-${i}`}
              className="inline-flex px-1.5 py-0.5 rounded border border-amber-400/25 bg-amber-400/10 font-mono text-[10px] text-amber-200/80"
            >
              {word}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={finish}
          className="px-2 py-1 rounded border border-emerald-400/35 font-mono text-[10px] text-emerald-300 hover:bg-emerald-400/10"
        >
          Chiudi
        </button>
      </div>
    </div>
  );
}

export const GlideBenchSegmentationEditor: ProvideEditorComponent<GridCell> = ({
  value,
  onFinishedEditing,
}) => {
  if (value.kind !== GridCellKind.Custom || !isGlideBenchSegCell(value as CustomCell)) {
    return null;
  }
  return (
    <GlideBenchSegmentationEditorInner
      value={value as CustomCell<GlideBenchSegCellData>}
      onFinishedEditing={onFinishedEditing}
    />
  );
};
