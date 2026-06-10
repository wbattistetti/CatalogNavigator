/**
 * Read-only tabular tooltip for contextual answer synonyms (hover on grammar toolbar).
 */
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import {
  sortSynonymsAlphabetically,
  synonymTableRowCount,
  type GrammarEditorPanel,
} from '../../lib/grammarSynonyms';

const VIEWPORT_MARGIN = 8;

export type GrammarTooltipAnchor = {
  toolbar: HTMLElement;
  questionText: HTMLElement;
};

/**
 * Positions tooltip flush to anchors.
 * Below: tooltip top-left = toolbar bottom-left.
 * Above: tooltip bottom-left = question text top-left.
 */
function positionTooltip(
  tooltipEl: HTMLElement,
  anchor: GrammarTooltipAnchor,
): CSSProperties {
  const toolbarRect = anchor.toolbar.getBoundingClientRect();
  const questionRect = anchor.questionText.getBoundingClientRect();
  const tipW = tooltipEl.offsetWidth;
  const tipH = tooltipEl.offsetHeight;

  const spaceBelow = window.innerHeight - VIEWPORT_MARGIN - toolbarRect.bottom;
  const spaceAbove = questionRect.top - VIEWPORT_MARGIN;
  const placeAbove = tipH > spaceBelow && spaceAbove >= spaceBelow;

  let left = placeAbove ? questionRect.left : toolbarRect.left;
  let top = placeAbove ? questionRect.top : toolbarRect.bottom;
  const transform = placeAbove ? 'translateY(-100%)' : undefined;

  if (left + tipW > window.innerWidth - VIEWPORT_MARGIN) {
    left = Math.max(VIEWPORT_MARGIN, window.innerWidth - tipW - VIEWPORT_MARGIN);
  }
  if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;

  if (!placeAbove && top + tipH > window.innerHeight - VIEWPORT_MARGIN) {
    top = Math.max(VIEWPORT_MARGIN, window.innerHeight - tipH - VIEWPORT_MARGIN);
  }
  if (placeAbove && top - tipH < VIEWPORT_MARGIN) {
    top = tipH + VIEWPORT_MARGIN;
  }

  return {
    visibility: 'visible',
    position: 'fixed',
    left,
    top,
    transform,
    zIndex: 100,
  };
}

export function AnswerGrammarSynonymTooltip({
  panels,
  anchor,
}: {
  panels: GrammarEditorPanel[];
  anchor: GrammarTooltipAnchor;
}) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden', position: 'fixed' });

  useLayoutEffect(() => {
    const el = tooltipRef.current;
    if (!el) return;
    setStyle(positionTooltip(el, anchor));
  }, [anchor, panels]);

  if (panels.length === 0) return null;

  const rowCount = synonymTableRowCount(panels);
  const sortedPanels = panels.map((p) => ({
    ...p,
    synonyms: sortSynonymsAlphabetically(p.synonyms),
  }));

  return (
    <div
      ref={tooltipRef}
      style={style}
      className="pointer-events-none rounded border border-sky-400/35 bg-[#0a1510] shadow-xl shadow-black/50 overflow-hidden w-max max-w-[min(520px,calc(100vw-16px))]"
      role="tooltip"
    >
      <table className="border-collapse text-left font-mono text-[10px]">
        <thead>
          <tr className="border-b border-[#1a3a2a] bg-[#080e0a]">
            {sortedPanels.map((panel) => (
              <th
                key={panel.targetPath}
                className="px-2.5 py-1.5 text-emerald-400/70 font-semibold whitespace-nowrap border-r border-[#1a3a2a] last:border-r-0"
              >
                {panel.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }, (_, rowIdx) => (
            <tr key={rowIdx} className="border-b border-[#1a3a2a]/60 last:border-b-0">
              {sortedPanels.map((panel) => (
                <td
                  key={panel.targetPath}
                  className="px-2.5 py-1 text-emerald-200/85 align-top border-r border-[#1a3a2a]/40 last:border-r-0 whitespace-nowrap"
                >
                  {panel.synonyms[rowIdx] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
